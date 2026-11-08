"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameConfig, SourceSpec } from "@/lib/types";
import { DEFAULT_FILTERS, loadConfig, saveConfig, setPendingGame } from "@/lib/settings";
import { needsSpotifyLogin } from "@/lib/sources";
import { isConnected } from "@/lib/spotify/auth";
import { pointsFor, formatSeconds } from "@/lib/scoring";
import { Button, Logo, Section, Spinner } from "./ui";
import { SourcesPanel } from "./SourcesPanel";
import { FiltersPanel, GamePanel, ScoringPanel } from "./SettingsPanels";
import { SpotifyLogo } from "./SpotifyConnect";

interface Preset {
  title: string;
  blurb: string;
  spotify?: boolean;
  apply: (c: GameConfig) => GameConfig;
}

const only = (sources: SourceSpec[], rounds: number, filters: Partial<GameConfig["filters"]> = {}) => (c: GameConfig): GameConfig => ({
  sources,
  filters: { ...DEFAULT_FILTERS, ...filters },
  settings: { ...c.settings, rounds },
});

const PRESETS: Preset[] = [
  { title: "Quick five", blurb: "5 hits from any decade", apply: only([{ kind: "catalog" }], 5) },
  { title: "Throwbacks", blurb: "10 songs from before 2000", apply: only([{ kind: "catalog" }], 10, { yearTo: 1999 }) },
  { title: "Charting now", blurb: "5 from the live global top 100", apply: only([{ kind: "deezer-chart" }], 5) },
  { title: "My Liked Songs", blurb: "5 rounds from your likes", spotify: true, apply: only([{ kind: "spotify-liked" }], 5) },
  { title: "Liked, pre-1999", blurb: "Your likes released before 1999", spotify: true, apply: only([{ kind: "spotify-liked" }], 5, { yearTo: 1998 }) },
  { title: "Artist marathon", blurb: "50 rounds across every artist you follow", spotify: true, apply: only([{ kind: "spotify-followed-artists" }], 50, { maxPerArtist: 2 }) },
];

export function Setup() {
  const router = useRouter();
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setConfig(loadConfig());
    setConnected(isConnected());
  }, []);

  useEffect(() => {
    if (config) saveConfig(config);
  }, [config]);

  if (!config) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-dim">
        <Spinner />
      </div>
    );
  }

  const start = (c: GameConfig) => {
    setStarting(true);
    setPendingGame(c);
    router.push("/play");
  };

  const missingLogin = !connected && config.sources.some(needsSpotifyLogin);
  const s = config.settings;
  const canStart = config.sources.length > 0 && !missingLogin;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-8 sm:pt-12">
      <header className="mb-10">
        <Logo className="text-xl" />
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
          Name the song in a <span className="text-accent">tenth of a second.</span>
        </h1>
        <p className="mt-3 max-w-xl text-dim">
          Hear a sliver of a song, guess it before you hear more. The less you needed, the more points you get, and wrong guesses cost you. Play the hits catalog or anything from your Spotify.
        </p>
      </header>

      <div className="mb-10">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Quick play</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PRESETS.filter((p) => !p.spotify || connected).map((p) => (
            <button
              key={p.title}
              type="button"
              disabled={starting}
              onClick={() => start(p.apply(config))}
              className="group rounded-2xl bg-panel p-4 text-left ring-1 ring-line transition hover:bg-panel2 hover:ring-accent/50"
            >
              <div className="flex items-center gap-1.5 font-semibold">
                {p.spotify && <SpotifyLogo className="h-3.5 w-3.5 text-[#1ed760]" />}
                {p.title}
              </div>
              <div className="mt-1 text-sm text-dim">{p.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Custom game</div>
      <div className="space-y-4">
        <Section title="Songs" subtitle="Mix as many sources as you like. Duplicates are removed.">
          <SourcesPanel sources={config.sources} onChange={(sources) => setConfig({ ...config, sources })} />
        </Section>
        <Section title="Filters">
          <FiltersPanel filters={config.filters} onChange={(filters) => setConfig({ ...config, filters })} />
        </Section>
        <Section title="Game">
          <GamePanel settings={config.settings} onChange={(settings) => setConfig({ ...config, settings })} />
        </Section>
        <Section title="Scoring" subtitle="Points drop exponentially with every second of audio you unlock.">
          <ScoringPanel settings={config.settings} onChange={(settings) => setConfig({ ...config, settings })} />
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 text-sm text-dim">
            {missingLogin ? (
              <span className="text-bad">Connect Spotify to use your library sources.</span>
            ) : config.sources.length === 0 ? (
              "Pick some songs first."
            ) : (
              <span className="truncate">
                {s.rounds === 0 ? "Every song" : `${s.rounds} rounds`} · from {formatSeconds(s.steps[0])} · up to {pointsFor(s.steps[0], s)} pts each
              </span>
            )}
          </div>
          <Button variant="primary" className="shrink-0 px-6" disabled={!canStart || starting} onClick={() => start(config)}>
            {starting ? <Spinner /> : "Start game"}
          </Button>
        </div>
      </div>
    </div>
  );
}
