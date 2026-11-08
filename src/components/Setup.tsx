"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameConfig, SourceSpec } from "@/lib/types";
import { DEFAULT_FILTERS, STEP_PRESETS, loadConfig, saveConfig, setPendingGame } from "@/lib/settings";
import { describeSource, needsSpotifyLogin } from "@/lib/sources";
import { beginLogin, getClientId, isConnected } from "@/lib/spotify/auth";
import { GENRES } from "@/lib/genres";
import { pointsFor, formatSeconds } from "@/lib/scoring";
import { Button, Logo, Section, Spinner, cx } from "./ui";
import { SourcesPanel } from "./SourcesPanel";
import { FiltersPanel, GamePanel, ScoringPanel } from "./SettingsPanels";
import { SpotifyLogo } from "./SpotifyConnect";
import { ScoreScale } from "./SnippetBar";

interface Preset {
  title: string;
  blurb: string;
  meta: string;
  spotify?: boolean;
  apply: (c: GameConfig) => GameConfig;
}

const only = (sources: SourceSpec[], rounds: number, filters: Partial<GameConfig["filters"]> = {}) => (c: GameConfig): GameConfig => ({
  sources,
  filters: { ...DEFAULT_FILTERS, ...filters },
  settings: { ...c.settings, rounds },
});

const PRESETS: Preset[] = [
  { title: "Quick five", blurb: "Five hits from any decade", meta: "Hits catalog · 5 rounds", apply: only([{ kind: "catalog" }], 5) },
  { title: "Throwbacks", blurb: "Ten songs from before 2000", meta: "Hits catalog · 10 rounds", apply: only([{ kind: "catalog" }], 10, { yearTo: 1999 }) },
  { title: "Charting now", blurb: "Five from the live global top 100", meta: "Global top 100 · 5 rounds", apply: only([{ kind: "deezer-chart" }], 5) },
  { title: "My Liked Songs", blurb: "Five rounds from your likes", meta: "Spotify · 5 rounds", spotify: true, apply: only([{ kind: "spotify-liked" }], 5) },
  { title: "Liked, before 1999", blurb: "Your likes released before 1999", meta: "Spotify · 5 rounds", spotify: true, apply: only([{ kind: "spotify-liked" }], 5, { yearTo: 1998 }) },
  { title: "Artist marathon", blurb: "Fifty rounds across every artist you follow", meta: "Spotify · 50 rounds", spotify: true, apply: only([{ kind: "spotify-followed-artists" }], 50, { maxPerArtist: 2 }) },
];

const START_LABEL = { beginning: "Beginning", middle: "Middle", random: "Random point" } as const;

function yearsLabel(from: number | null, to: number | null) {
  if (from == null && to == null) return "Any";
  if (from == null) return `Before ${(to ?? 0) + 1}`;
  if (to == null) return `${from} on`;
  return from === to ? `${from}` : `${from} to ${to}`;
}

function rulesSummary(c: GameConfig): [string, string][] {
  const s = c.settings;
  const f = c.filters;
  const preset = STEP_PRESETS.find((p) => p.steps.join() === s.steps.join());
  const genres = f.genres.map((g) => GENRES.find((x) => x.code === g)?.label ?? g);
  const rows: [string, string][] = [
    ["Rounds", s.rounds === 0 ? "Every song" : `${s.rounds}`],
    ["Snippets", `${formatSeconds(s.steps[0])} to ${formatSeconds(s.steps[s.steps.length - 1])}${preset ? "" : `, ${s.steps.length} steps`}`],
    ["Starts at", START_LABEL[s.startMode]],
    ["Scoring", `${s.maxPoints.toLocaleString()}, halves every ${formatSeconds(s.halfLife)}`],
    ["Wrong guess", s.wrongPenalty ? `−${s.wrongPenalty}` : "Free"],
    ["Years", yearsLabel(f.yearFrom, f.yearTo)],
    ["Genres", genres.length ? genres.join(", ") : "All"],
    ["Audio", s.engine === "spotify" ? "Full tracks (Spotify)" : "30s previews"],
  ];
  const extra = [
    f.onlyArtists.length ? `only ${f.onlyArtists.join(", ")}` : "",
    f.excludeArtists.length ? `no ${f.excludeArtists.join(", ")}` : "",
    f.excludeExplicit ? "no explicit songs" : "",
    f.maxPerArtist ? `max ${f.maxPerArtist} per artist` : "",
  ].filter(Boolean);
  if (extra.length) rows.push(["Also", extra.join("; ")]);
  return rows;
}

export function Setup() {
  const router = useRouter();
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [connected, setConnected] = useState(false);
  const [canConnect, setCanConnect] = useState(false);
  const [starting, setStarting] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    setConfig(loadConfig());
    setConnected(isConnected());
    setCanConnect(!!getClientId());
  }, []);

  useEffect(() => {
    if (config) saveConfig(config);
  }, [config]);

  if (!config) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-2">
        <Spinner />
      </div>
    );
  }

  const start = (c: GameConfig) => {
    setStarting(true);
    setPendingGame(c);
    router.push("/play");
  };
  const connect = () => beginLogin({ returnTo: "/" });

  const missingLogin = !connected && config.sources.some(needsSpotifyLogin);
  const s = config.settings;
  const canStart = config.sources.length > 0 && !missingLogin;
  const presets = PRESETS.filter((p) => !p.spotify || connected || canConnect);
  const sourceNames = config.sources.map(describeSource);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 border-b border-rule px-5 py-5 sm:px-10">
        <Logo />
        {connected ? (
          <span className="inline-flex items-center gap-2 text-sm text-ink-2">
            <SpotifyLogo className="h-4 w-4 text-ink" /> Spotify connected
          </span>
        ) : canConnect ? (
          <Button onClick={connect} className="h-10 min-h-10 text-sm">
            <SpotifyLogo /> Connect Spotify
          </Button>
        ) : null}
      </header>

      <main className="mx-auto max-w-[1120px] px-5 pb-40 sm:px-10">
        <section className="flex flex-wrap items-end gap-x-16 gap-y-6 pb-10 pt-12 sm:pt-20">
          <div className="numeral leading-[0.8]" aria-hidden>
            <span className="text-[148px] sm:text-[240px]">0.1</span>
            <span className="text-[60px] tracking-normal sm:text-[96px]">s</span>
          </div>
          <div className="min-w-0 flex-[1_1_380px] pb-2">
            <h1 className="text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[44px]">Name the song from a tenth of a second.</h1>
            <p className="mt-4 max-w-[460px] text-lg text-ink-2">You hear a sliver. Guess it, or unlock a little more. The less you needed, the more it is worth.</p>
          </div>
        </section>

        <section aria-label="How scoring works" className="pb-16 sm:pb-20">
          <ScoreScale settings={s} />
          <p className="mt-2 text-sm text-ink-2">
            Points for a correct guess at each length.
            {s.wrongPenalty > 0 && ` A wrong guess costs ${s.wrongPenalty}${s.wrongUnlocks ? " and unlocks the next one" : ""}.`}
          </p>
        </section>

        <Section title="Play now" subtitle="Pick one and go. Nothing to set up.">
          <ol>
            {presets.map((p, i) => {
              const locked = p.spotify && !connected;
              return (
                <li key={p.title} className="border-b border-rule">
                  <button
                    type="button"
                    disabled={starting}
                    onClick={() => (locked ? connect() : start(p.apply(config)))}
                    className="group grid min-h-[72px] w-full grid-cols-[36px_minmax(0,1fr)_24px] items-center gap-x-3 px-1 py-3 text-left transition-colors hover:bg-paper-2 sm:grid-cols-[56px_minmax(0,1fr)_auto_32px] sm:gap-x-4 sm:px-2"
                  >
                    <span className="text-[15px] font-semibold text-ink-3 condensed tabular">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-lg font-bold sm:text-xl">
                        {p.title}
                        {p.spotify && <SpotifyLogo className="h-3.5 w-3.5 text-ink-2" />}
                      </span>
                      <span className="block text-[15px] text-ink-2">{p.blurb}</span>
                      <span className="block text-sm text-ink-2 sm:hidden">{locked ? "Connect Spotify to play" : p.meta}</span>
                    </span>
                    <span className="hidden text-sm text-ink-2 sm:block">{locked ? "Connect Spotify to play" : p.meta}</span>
                    <span className="text-[22px] transition-colors group-hover:text-signal" aria-hidden>
                      &rarr;
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Section>

        <div className="pt-20">
          <Section title="Build a game" subtitle="Mix any sources. Duplicates are removed.">
            <div className="flex flex-wrap gap-x-16 gap-y-12 pt-8">
              <div className="min-w-0 flex-[999_1_520px]">
                <h3 className="mb-1 text-lg font-bold">Songs</h3>
                <SourcesPanel sources={config.sources} onChange={(sources) => setConfig({ ...config, sources })} />
              </div>
              <div className="min-w-0 flex-[1_1_300px]">
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="text-lg font-bold">Rules</h3>
                  <Button variant="text" aria-expanded={rulesOpen} aria-controls="rules" onClick={() => setRulesOpen(!rulesOpen)} className="text-sm">
                    {rulesOpen ? "Done" : "Change"}
                  </Button>
                </div>
                <dl className="tabular">
                  {rulesSummary(config).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-rule py-3">
                      <dt className="shrink-0 text-ink-2">{k}</dt>
                      <dd className="min-w-0 text-right font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                {!rulesOpen && <p className="mt-3 text-sm text-ink-2">Filters, scoring, snippet lengths and full-track Spotify playback live under Change.</p>}
              </div>
            </div>
          </Section>

          {rulesOpen && (
            <div id="rules" className="animate-rise mt-12 grid gap-x-16 gap-y-12 lg:grid-cols-2">
              <RuleGroup title="Game">
                <GamePanel settings={config.settings} onChange={(settings) => setConfig({ ...config, settings })} />
              </RuleGroup>
              <div className="space-y-12">
                <RuleGroup title="Filters">
                  <FiltersPanel filters={config.filters} onChange={(filters) => setConfig({ ...config, filters })} />
                </RuleGroup>
                <RuleGroup title="Scoring" note="Points halve with every few seconds of audio you unlock.">
                  <ScoringPanel settings={config.settings} onChange={(settings) => setConfig({ ...config, settings })} />
                </RuleGroup>
              </div>
            </div>
          )}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t-2 border-ink bg-paper">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-3 sm:px-10">
          <p className="min-w-0 text-[15px] text-ink-2 tabular">
            {missingLogin ? (
              <span className="text-error">Connect Spotify to use your library sources.</span>
            ) : config.sources.length === 0 ? (
              "Pick some songs first."
            ) : (
              <span className="line-clamp-2">
                <span className="font-semibold text-ink">{s.rounds === 0 ? "Every song" : `${s.rounds} rounds`}</span>
                <span className="hidden sm:inline"> from {sourceNames.length > 2 ? `${sourceNames.length} sources` : sourceNames.join(" and ")}</span>
                {" · "}up to {pointsFor(s.steps[0], s).toLocaleString()} each
              </span>
            )}
          </p>
          <Button variant="primary" className={cx("h-[52px] shrink-0 px-7 text-[17px]")} disabled={!canStart || starting} onClick={() => start(config)}>
            {starting ? <Spinner /> : "Start game"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RuleGroup({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 border-b-2 border-ink pb-2">
        <h3 className="text-lg font-bold">{title}</h3>
        {note && <p className="text-sm text-ink-2">{note}</p>}
      </div>
      {children}
    </section>
  );
}
