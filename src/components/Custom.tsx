"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GameConfig, GameSettings, SourceSpec } from "@/lib/types";
import { loadConfig, saveConfig, setPendingGame } from "@/lib/settings";
import { needsSpotifyLogin, playlistName } from "@/lib/sources";
import { describeMode } from "@/lib/modes";
import { logout } from "@/lib/spotify/auth";
import { Button, Spinner, cx } from "./ui";
import { ShortcutHelp, modKey, useShortcuts, type Shortcut } from "./Shortcuts";
import { SpotifyLogo } from "./SpotifyConnect";
import { SourcesPanel, useSpotifyAccount } from "./SourcesPanel";
import { ModePanel } from "./ModePanel";
import {
  ArtistsRow,
  AudioRow,
  Chevron,
  GenrePicker,
  GuessingRows,
  RoundsPicker,
  ScoringPanel,
  SkipRow,
  SnippetsRow,
  StartRow,
  YearPicker,
  genreSummary,
  popoverPanel,
  roundsSummary,
  usePopover,
  yearSummary,
} from "./SettingsPanels";

/** Short source names for the start bar. */
function shortName(s: SourceSpec): string {
  switch (s.kind) {
    case "catalog": return "Hits catalog";
    case "deezer-chart": return "Global top 100";
    case "spotify-liked": return "Liked Songs";
    case "spotify-top": return "Top tracks";
    case "spotify-recent": return "Recently played";
    case "spotify-saved-albums": return "Saved albums";
    case "spotify-followed-artists": return "Followed artists";
    case "spotify-top-artists": return "Top artists";
    case "spotify-link": return s.name || `Spotify ${s.type}`;
    default: return s.name;
  }
}

function sourcesPhrase(sources: SourceSpec[]): string {
  const names = [...new Set(sources.map(shortName))];
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

function roundsPhrase(s: GameSettings): string {
  return s.rounds === 0 ? (s.mode === "higherlower" ? "until you miss" : "every song") : `${s.rounds} round${s.rounds === 1 ? "" : "s"}`;
}

/** "Play your Spotify": pick sources, set options, start. */
export function Custom() {
  const router = useRouter();
  const account = useSpotifyAccount();
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [starting, setStarting] = useState(false);
  const [filter, setFilter] = useState("");
  const [more, setMore] = useState(false);
  const [scoring, setScoring] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const scoringRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // A game of your own music: the built-in hits never come along from the default game.
    const c = loadConfig();
    setConfig({ ...c, sources: c.sources.filter((x) => x.kind !== "catalog") });
  }, []);

  useEffect(() => {
    if (config) saveConfig(config);
  }, [config]);

  const connected = account.status === "connected";

  // Nothing picked yet: start from Liked Songs once Spotify is connected.
  const autoPicked = useRef(false);
  useEffect(() => {
    if (!connected || !config || autoPicked.current) return;
    autoPicked.current = true;
    if (!config.sources.length) setConfig({ ...config, sources: [{ kind: "spotify-liked" }] });
  }, [connected, config]);
  const missingLogin = !!config && !connected && config.sources.some(needsSpotifyLogin);
  const canStart = !!config && config.sources.length > 0 && !missingLogin && !starting;

  const launch = (c: GameConfig) => {
    setStarting(true);
    setPendingGame({ ...c, category: "custom" });
    router.push("/play");
  };

  // Cmd/Ctrl+Enter starts from anywhere, even while typing. Fields that save on blur are blurred
  // first, so start once that change has rendered.
  const latest = useRef({ config, canStart, launch });
  latest.current = { config, canStart, launch };
  const startFromKeyboard = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setTimeout(() => {
      const { config: c, canStart: ok, launch: go } = latest.current;
      if (c && ok) go(c);
    }, 0);
  };
  const shortcuts: Shortcut[] = [{ keys: ["Enter"], mod: true, typing: true, display: `${modKey()} Enter`, label: "Start", run: startFromKeyboard, enabled: canStart }];
  const { help, setHelp } = useShortcuts(shortcuts);

  if (!config) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-3">
        <Spinner />
      </div>
    );
  }

  const s = config.settings;
  const patch = (p: Partial<GameConfig>) => setConfig((c) => c && { ...c, ...p });
  const setSettings = (settings: GameSettings) => patch({ settings });
  const setFilters = (filters: GameConfig["filters"]) => patch({ filters });
  const playlists = account.playlists?.length ?? 0;
  const ctx = {
    savedDates: connected && config.sources.some((x) => x.kind === "spotify-liked" || x.kind === "spotify-playlist" || x.kind === "spotify-saved-albums"),
    playlists: new Set(config.sources.map(playlistName).filter(Boolean)).size,
  };

  /** Escape closes a panel; fields that save on blur are committed first. */
  const closeOn = (close: () => void, ref: React.RefObject<HTMLButtonElement | null>) => (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    (document.activeElement as HTMLElement | null)?.blur?.();
    close();
    ref.current?.focus();
  };

  return (
    <div className="min-h-dvh">
      <ShortcutHelp open={help} onClose={() => setHelp(false)} shortcuts={shortcuts} />

      <header className="mx-auto flex w-full max-w-[1076px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pb-2 pt-6 sm:pt-10">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/" aria-label="Back" className="-ml-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-card">
            <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" aria-hidden>
            <path d="M12.5 4 L6.5 10 L12.5 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          </Link>
          <h1 className="hand truncate pt-1.5 text-[44px] leading-[52px] sm:text-[64px] sm:leading-[70px]">Pick your songs</h1>
        </div>
        {connected && (
          <div className="flex min-w-0 items-center gap-2 text-[16px] text-ink-2">
            <SpotifyLogo className="h-5 w-5 shrink-0 text-[#1DB954]" />
            {account.name && <span className="truncate">{account.name}</span>}
            <button
              type="button"
              className="ml-2 min-h-11 shrink-0 text-[15px] text-ink-3 hover:text-ink"
              onClick={() => {
                logout();
                window.location.reload();
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1076px] px-5 pb-44">
        <div className="flex flex-wrap items-end justify-end gap-x-8 gap-y-4">
          {connected && playlists > 12 && (
            <div className="relative w-full sm:mb-1 sm:w-[300px]">
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7.5" />
                <path d="m20.5 20.5-4-4" />
              </svg>
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Search ${playlists} playlists`}
                aria-label="Search playlists"
                autoComplete="off"
                className="h-12 w-full rounded-full border-[1.5px] border-transparent bg-card pl-12 pr-5 text-[17px] text-ink outline-none placeholder:text-ink-3 focus:border-ink focus-visible:outline-none"
              />
            </div>
          )}
        </div>
        {account.error && <p className="mt-3 max-w-[680px] text-[15px] text-error">{account.error}</p>}

        <div className="mt-7">
          <SourcesPanel sources={config.sources} onChange={(sources) => patch({ sources })} account={account} filter={filter} />
        </div>

        <div className="relative mt-9 flex flex-wrap items-center gap-3">
          <OptionPill label={genreSummary(config.filters)} name="Genre" panelClassName="w-[560px]">
            <GenrePicker filters={config.filters} onChange={setFilters} />
          </OptionPill>
          <OptionPill label={yearSummary(config.filters)} name="Years" panelClassName="w-[470px]">
            <YearPicker filters={config.filters} onChange={setFilters} />
          </OptionPill>
          <OptionPill label={roundsSummary(s)} name="Rounds" panelClassName="w-[400px]">
            <RoundsPicker settings={s} onChange={setSettings} />
          </OptionPill>
          <button ref={moreRef} type="button" aria-expanded={more} aria-controls="more-options" onClick={() => setMore(!more)} className="ml-1 inline-flex min-h-11 items-center gap-2 px-2 text-[18px] text-ink-2 hover:text-ink">
            {more ? "Fewer options" : "More options"}
            <Chevron open={more} />
          </button>
        </div>

        {more && (
          <div id="more-options" className="animate-rise mt-9 space-y-6" onKeyDown={closeOn(() => setMore(false), moreRef)}>
            <ModePanel settings={s} onChange={setSettings} ctx={ctx} />
            {s.mode === "classic" && (
              <>
                <SnippetsRow settings={s} onChange={setSettings} />
                <StartRow settings={s} onChange={setSettings} />
              </>
            )}
            <ArtistsRow filters={config.filters} onChange={setFilters} />
            <SkipRow filters={config.filters} onChange={setFilters} />
            <div className="sm:pl-[154px]">
              <button ref={scoringRef} type="button" aria-expanded={scoring} aria-controls="scoring-audio" onClick={() => setScoring(!scoring)} className="inline-flex min-h-11 items-center gap-2 text-[18px] text-ink-2 hover:text-ink">
                Scoring and audio
                <Chevron open={scoring} />
              </button>
            </div>
            {scoring && (
              <div id="scoring-audio" className="animate-rise space-y-6" onKeyDown={closeOn(() => setScoring(false), scoringRef)}>
                {s.mode === "classic" && <ScoringPanel settings={s} onChange={setSettings} />}
                <AudioRow settings={s} onChange={setSettings} />
                <GuessingRows settings={s} onChange={setSettings} />
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-paper-2">
        <div className="mx-auto flex h-24 w-full max-w-[1076px] items-center justify-between gap-4 px-5">
          <p className="min-w-0 text-[16px] text-ink-2 sm:text-[18px]">
            {missingLogin ? (
              <span className="text-error">Connect Spotify to play your library</span>
            ) : config.sources.length === 0 ? (
              "Pick some songs"
            ) : (
              <span className="line-clamp-2">
                <span className="font-semibold text-ink">{describeMode(s)}</span>
                {" · "}
                {roundsPhrase(s)} from {sourcesPhrase(config.sources)}
              </span>
            )}
          </p>
          <Button variant="primary" className="h-[60px] shrink-0" disabled={!canStart} onClick={() => launch(config)} aria-keyshortcuts={modKey() === "⌘" ? "Meta+Enter" : "Control+Enter"}>
            {starting ? <Spinner /> : "Start"}
            {!starting && (
              <kbd className="hidden rounded-md bg-paper/20 px-1.5 py-0.5 font-sans text-[13px] font-semibold leading-tight sm:inline" aria-hidden>
                {modKey() === "⌘" ? "⌘↵" : "Ctrl ↵"}
              </kbd>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** An outline pill ("Any genre ▾") that opens a small anchored panel. */
function OptionPill({ label, name, panelClassName, children }: { label: string; name: string; panelClassName?: string; children: ReactNode }) {
  const pop = usePopover();
  return (
    <div className="sm:relative" {...pop.wrapProps}>
      <button
        type="button"
        {...pop.triggerProps}
        aria-label={`${name}: ${label}`}
        className={cx("inline-flex h-[50px] items-center gap-2.5 rounded-full border-[1.5px] border-ink px-6 text-[18px] text-ink transition-colors hover:bg-card", pop.open && "bg-card")}
      >
        <span className="max-w-[240px] truncate">{label}</span>
        <Chevron open={pop.open} />
      </button>
      {pop.open && (
        <div {...pop.panelProps} aria-label={name} className={cx(popoverPanel, panelClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}
