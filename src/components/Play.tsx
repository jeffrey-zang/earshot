"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameConfig, GameSettings, RoundResult, Track, ArtistRef } from "@/lib/types";
import { getPendingGame, loadConfig } from "@/lib/settings";
import { describeSource, loadSource } from "@/lib/sources";
import { Pool } from "@/lib/pool";
import { decodeChallenge, loadChallengeTracks, type Challenge } from "@/lib/challenge";
import { PreviewSnippetPlayer, SpotifySnippetPlayer, type SnippetPlayer } from "@/lib/player";
import { PLAYBACK_SCOPES, hasScopes } from "@/lib/spotify/auth";
import { Game, type TrackSource } from "./Game";
import { Results } from "./Results";
import { Button, Logo, Spinner } from "./ui";

type Phase =
  | { kind: "loading"; messages: string[] }
  | { kind: "error"; message: string }
  | { kind: "playing"; source: TrackSource; player: SnippetPlayer; settings: GameSettings; rounds: number; seed: number; notes: string[]; challenge?: Challenge }
  | { kind: "done"; results: RoundResult[]; settings: GameSettings; seed: number; note?: string; challenge?: Challenge };

class FixedSource implements TrackSource {
  private i = 0;
  constructor(public all: Track[]) {}
  async next() {
    return this.all[this.i++] ?? null;
  }
}

function makePlayer(settings: GameSettings): { player: SnippetPlayer; note?: string } {
  if (settings.engine === "spotify") {
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
        const { player } = makePlayer(settings);
        if (!cancelled) setPhase({ kind: "playing", source: new FixedSource(tracks), player, settings, rounds: tracks.length, seed: challenge.seed, notes: [], challenge });
        return;
      }

      const config: GameConfig = getPendingGame() ?? loadConfig();
      if (!config.sources.length) throw new Error("No songs selected.");
      const notes: string[] = [];
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
      const pool = new Pool(tracks, artists, config.filters, config.settings);
      if (!pool.candidateCount && !pool.artistCount) throw new Error(`None of the ${tracks.length.toLocaleString()} songs match your filters.`);
      const rounds = config.settings.rounds || Math.min(500, pool.estimatedSize);
      const { player, note } = makePlayer(config.settings);
      if (note) notes.push(note);
      if (!cancelled) setPhase({ kind: "playing", source: pool, player, settings: config.settings, rounds, seed, notes });
    })().catch((e: Error) => {
      if (!cancelled) setPhase({ kind: "error", message: e.message });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, log]);

  useEffect(() => {
    if (phase.kind !== "playing") return;
    const p = phase.player;
    return () => p.dispose();
  }, [phase]);

  const banner = useMemo(() => {
    if (phase.kind !== "playing") return null;
    const c = phase.challenge;
    if (!c && !phase.notes.length) return null;
    return (
      <div className="mt-3 space-y-1 rounded-xl bg-panel p-3 text-xs text-dim ring-1 ring-line">
        {c && <p className="text-sm text-fg">Challenge{c.score != null ? `: beat ${c.score.toLocaleString()} points` : ""}</p>}
        {phase.notes.map((n, i) => (
          <p key={i}>{n}</p>
        ))}
      </div>
    );
  }, [phase]);

  if (phase.kind === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
        <Logo className="text-xl" />
        <Spinner className="h-6 w-6 text-accent" />
        <div className="h-20 text-center text-sm text-dim">
          {phase.messages.slice(-3).map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
        <Logo className="text-xl" />
        <p className="whitespace-pre-line text-bad">{phase.message}</p>
        <div className="flex gap-2">
          <Button onClick={() => router.push("/")}>Change settings</Button>
          <Button variant="primary" onClick={() => { setPhase({ kind: "loading", messages: [] }); setAttempt((a) => a + 1); }}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (phase.kind === "done") {
    return (
      <Results
        results={phase.results}
        settings={phase.settings}
        seed={phase.seed}
        note={phase.note}
        challengeScore={phase.challenge?.score}
        onReplay={() => {
          setPhase({ kind: "loading", messages: [] });
          setAttempt((a) => a + 1);
        }}
        onNewGame={() => router.push("/")}
      />
    );
  }

  return (
    <Game
      key={attempt}
      source={phase.source}
      player={phase.player}
      settings={phase.settings}
      totalRounds={phase.rounds}
      seed={phase.seed}
      banner={banner}
      onQuit={() => router.push("/")}
      onFinish={(results, note) => setPhase({ kind: "done", results, settings: phase.settings, seed: phase.seed, note, challenge: phase.challenge })}
    />
  );
}
