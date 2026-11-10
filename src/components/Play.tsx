"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameConfig, GameSettings, RoundResult, Track, ArtistRef } from "@/lib/types";
import { getPendingGame, loadConfig } from "@/lib/settings";
import { describeSource, loadSource, playlistName } from "@/lib/sources";
import { FIELD_INFO, unavailableFields } from "@/lib/modes";
import { lastfmEnabled } from "@/lib/lastfm";
import { isConnected } from "@/lib/spotify/auth";
import { LyricsGame } from "./LyricsGame";
import { HigherLowerGame } from "./HigherLowerGame";
import { Pool } from "@/lib/pool";
import { decodeChallenge, loadChallengeTracks, type Challenge } from "@/lib/challenge";
import { PreviewSnippetPlayer, SpotifySnippetPlayer, type SnippetPlayer } from "@/lib/player";
import { PLAYBACK_SCOPES, hasScopes } from "@/lib/spotify/auth";
import { isIOS } from "@/lib/audio";
import { Game, type TrackSource } from "./Game";
import { Results } from "./Results";
import { ErrorScreen, LoadingNotes, StatusScreen } from "./StatusScreen";

type Phase =
  | { kind: "loading"; messages: string[] }
  | { kind: "error"; message: string }
  | { kind: "playing"; source: TrackSource; player: SnippetPlayer; settings: GameSettings; rounds: number; seed: number; notes: string[]; challenge?: Challenge; playlists: string[]; category: string }
  | { kind: "done"; results: RoundResult[]; settings: GameSettings; seed: number; note?: string; challenge?: Challenge; player: SnippetPlayer; category: string };

class FixedSource implements TrackSource {
  private i = 0;
  constructor(public all: Track[]) {}
  async next() {
    return this.all[this.i++] ?? null;
  }
}

function makePlayer(settings: GameSettings): { player: SnippetPlayer; note?: string } {
  // higher-or-lower flips between two songs, which full-track playback can't do quickly
  if (settings.engine === "spotify" && isIOS()) {
    return { player: new PreviewSnippetPlayer(settings), note: "Spotify's full-track player doesn't work on iPhone or iPad, so this game uses 30s previews." };
  }
  if (settings.engine === "spotify" && settings.mode !== "higherlower") {
    if (hasScopes(PLAYBACK_SCOPES)) return { player: new SpotifySnippetPlayer(settings) };
    return { player: new PreviewSnippetPlayer(settings), note: "Full-track playback needs a Spotify Premium login with playback allowed, so this game uses previews." };
  }
  return { player: new PreviewSnippetPlayer(settings) };
}

export function Play() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading", messages: [] });
  const [attempt, setAttempt] = useState(0);

  const log = useCallback((msg: string) => {
    setPhase((p) => (p.kind === "loading" ? { kind: "loading", messages: [...p.messages.slice(-5), msg] } : p));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("c");

    (async () => {
      const seed = Math.floor(Math.random() * 2 ** 31);
      if (code) {
        const challenge = decodeChallenge(code);
        if (!challenge) throw new Error("That challenge link is broken.");
        log(`Loading ${challenge.t.length} challenge songs`);
        const tracks = await loadChallengeTracks(challenge.t);
        if (!tracks.length) throw new Error("None of the songs in this challenge could be loaded.");
        const settings: GameSettings = { ...loadConfig().settings, ...challenge.s, engine: "preview", rounds: tracks.length };
        if (!settings.fields?.length) settings.fields = ["title"];
        const rounds = settings.mode === "higherlower" ? tracks.length - 1 : tracks.length;
        const { player } = makePlayer(settings);
        if (!cancelled) setPhase({ kind: "playing", source: new FixedSource(tracks), player, settings, rounds, seed: challenge.seed, notes: [], challenge, playlists: [], category: "challenge" });
        return;
      }

      const config: GameConfig = getPendingGame() ?? loadConfig();
      if (!config.sources.length) throw new Error("No songs selected.");
      const notes: string[] = [];
      const playlists = [...new Set(config.sources.map(playlistName).filter((x): x is string => !!x))];
      const settings: GameSettings = { ...config.settings };
      // drop questions this setup can't answer (no Last.fm key, no Spotify login, one playlist...)
      const savedDates = isConnected() && config.sources.some((x) => x.kind === "spotify-liked" || x.kind === "spotify-playlist" || x.kind === "spotify-saved-albums");
      if (settings.mode === "classic") {
        const lastfm = settings.fields.some((f) => f === "plays" || f === "myplays") ? await lastfmEnabled() : false;
        const missing = unavailableFields(settings, { spotify: savedDates, lastfm, playlists: playlists.length });
        if (missing.length) {
          settings.fields = settings.fields.filter((f) => !missing.includes(f));
          notes.push(`Skipping ${missing.map((f) => FIELD_INFO[f].label.toLowerCase()).join(", ")}: ${missing.map((f) => needText(FIELD_INFO[f].needs)).join("; ")}.`);
          if (!settings.fields.length) settings.fields = ["title"];
        }
      }
      if (settings.mode === "higherlower" && settings.hlMetric === "added" && !savedDates) {
        settings.hlMetric = "year";
        notes.push("Saved dates come from your Spotify Liked Songs, playlists or saved albums, so this game compares release years instead.");
      }
      if (settings.mode === "higherlower" && settings.hlMetric === "plays" && !(await lastfmEnabled())) {
        settings.hlMetric = "popularity";
        notes.push("Last.fm isn't set up on this site, so this game compares popularity instead of plays.");
      }
      const tracks: Track[] = [];
      const artists: ArtistRef[] = [];
      const loaded = await Promise.allSettled(config.sources.map((s) => loadSource(s, log)));
      loaded.forEach((r, i) => {
        if (r.status === "fulfilled") {
          tracks.push(...r.value.tracks);
          artists.push(...r.value.artists);
          notes.push(...r.value.notes);
        } else {
          notes.push(`Couldn't load ${describeSource(config.sources[i])}: ${(r.reason as Error)?.message ?? "unknown error"}`);
        }
      });
      if (!tracks.length && !artists.length) throw new Error(notes.join("\n") || "Those sources have no songs.");
      const pool = new Pool(tracks, artists, config.filters, settings);
      if (!pool.candidateCount && !pool.artistCount) throw new Error(`None of the ${tracks.length.toLocaleString()} songs match your filters.`);
      const rounds = settings.rounds || Math.min(500, pool.estimatedSize);
      const { player, note } = makePlayer(settings);
      if (note) notes.push(note);
      if (!cancelled) setPhase({ kind: "playing", source: pool, player, settings, rounds, seed, notes, playlists, category: config.category ?? "custom" });
    })().catch((e: Error) => {
      if (!cancelled) setPhase({ kind: "error", message: e.message });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, log]);

  // The game's player lives on into the results (which play your best song), then is closed.
  const activePlayer = phase.kind === "playing" || phase.kind === "done" ? phase.player : null;
  useEffect(() => {
    if (!activePlayer) return;
    return () => activePlayer.dispose();
  }, [activePlayer]);

  const banner = useMemo(() => {
    if (phase.kind !== "playing") return null;
    const c = phase.challenge;
    if (!c && !phase.notes.length) return null;
    return (
      <div className="mx-auto mt-2 w-full max-w-[760px] space-y-1 text-center text-[14px] leading-snug text-ink-3">
        {c && <p className="text-[15px] font-semibold text-ink-2">Challenge{c.score != null ? ` · beat ${c.score.toLocaleString()}` : ""}</p>}
        {phase.notes.map((n, i) => (
          <p key={i}>{n}</p>
        ))}
      </div>
    );
  }, [phase]);

  const retry = () => {
    setPhase({ kind: "loading", messages: [] });
    setAttempt((a) => a + 1);
  };

  if (phase.kind === "loading") {
    return (
      <StatusScreen>
        <LoadingNotes message={phase.messages.at(-1) ?? "Getting songs ready"} />
      </StatusScreen>
    );
  }

  if (phase.kind === "error") {
    return <ErrorScreen title="Couldn't start" message={phase.message} primary={{ label: "Try again", run: retry }} secondary={{ label: "Back", run: () => router.push("/") }} />;
  }

  if (phase.kind === "done") {
    return (
      <Results
        results={phase.results}
        settings={phase.settings}
        seed={phase.seed}
        note={phase.note}
        challengeScore={phase.challenge?.score}
        onReplay={retry}
        onNewGame={() => router.push("/")}
        player={phase.player}
        category={phase.category}
      />
    );
  }

  const common = {
    source: phase.source,
    player: phase.player,
    settings: phase.settings,
    totalRounds: phase.rounds,
    seed: phase.seed,
    banner,
    onQuit: () => router.push("/"),
    onFinish: (results: RoundResult[], note?: string) => setPhase({ kind: "done", results, settings: phase.settings, seed: phase.seed, note, challenge: phase.challenge, player: phase.player, category: phase.category }),
  };
  if (phase.settings.mode === "lyrics") return <LyricsGame key={attempt} {...common} />;
  if (phase.settings.mode === "higherlower") return <HigherLowerGame key={attempt} {...common} />;
  return (
    <Game
      key={attempt}
      playlistOptions={phase.playlists}
      source={phase.source}
      player={phase.player}
      settings={phase.settings}
      totalRounds={phase.rounds}
      seed={phase.seed}
      banner={banner}
      onQuit={() => router.push("/")}
      onFinish={(results, note) => setPhase({ kind: "done", results, settings: phase.settings, seed: phase.seed, note, challenge: phase.challenge, player: phase.player, category: phase.category })}
    />
  );
}

function needText(need: string | undefined): string {
  switch (need) {
    case "spotify": return "needs your Spotify Liked Songs, playlists or saved albums";
    case "lastfm": return "Last.fm isn't set up on this site";
    case "lastfmUser": return "needs Last.fm and your Last.fm username";
    case "playlists": return "needs two or more playlists in the game";
    default: return "not available";
  }
}
