"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Engine, Filters, GameSettings, GenreCode, StartMode } from "@/lib/types";
import { GENRES } from "@/lib/genres";
import { STEP_PRESETS } from "@/lib/settings";
import { formatSeconds } from "@/lib/scoring";
import { Chip, ChoiceLine, NumberField, cx } from "./ui";
import { ConnectButton } from "./SpotifyConnect";
import { ScoreScale } from "./SnippetBar";
import { PLAYBACK_SCOPES, hasScopes, isConnected } from "@/lib/spotify/auth";

/* ------------------------------------------------------------------ shared bits */

/** Rounded text input without a resting border; add a background (bg-field, bg-paper) where it's used. */
export const pillField =
  "h-12 w-full min-w-0 rounded-full border-[1.5px] border-transparent px-5 text-[17px] text-ink outline-none placeholder:text-ink-3 focus:border-ink focus-visible:outline-none";

/** Down chevron for disclosures; flips when open. */
export function Chevron({ open = false, className }: { open?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * A small anchored panel. Spread `wrapProps` on a positioned wrapper that holds both the trigger and
 * the panel, `triggerProps` on the button, and `panelProps` on the panel (render it only when open).
 * Closes on Escape (focus returns to the trigger), on a click outside, and when focus tabs out.
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    // Keep it on screen: flip to the trigger's right edge when it would overflow.
    panel.style.left = "";
    panel.style.right = "";
    if (panel.getBoundingClientRect().right > window.innerWidth - 16) {
      panel.style.left = "auto";
      panel.style.right = "0px";
    }
    panel.querySelector<HTMLElement>("input, select, button:not([disabled]), [tabindex]:not([tabindex='-1'])")?.focus();
  }, [open]);

  return {
    open,
    setOpen,
    close,
    wrapProps: {
      ref: wrapRef,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (open && e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
      },
      onBlur: (e: React.FocusEvent) => {
        const to = e.relatedTarget as Node | null;
        if (open && to && !wrapRef.current?.contains(to)) setOpen(false);
      },
    },
    triggerProps: {
      ref: triggerRef,
      "aria-expanded": open,
      "aria-controls": id,
      "aria-haspopup": "dialog" as const,
      onClick: () => setOpen((o) => !o),
    },
    panelProps: { ref: panelRef, id, role: "dialog" },
  };
}

/** Panel chrome for usePopover. */
export const popoverPanel = "animate-rise absolute left-0 top-full z-30 mt-2 max-w-[calc(100vw-40px)] rounded-[22px] bg-card p-5 shadow-[0_18px_50px_-12px_rgba(30,30,30,0.28)]";

/** One labelled line of options: the label in a 130px column, the controls beside it. */
export function OptionRow({ label, htmlFor, children, className }: { label: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  const id = useId();
  const labelCls = "text-[18px] leading-[26px] text-ink-3 sm:pt-[9px]";
  return (
    <div className={cx("grid items-start gap-x-6 gap-y-2 sm:grid-cols-[130px_minmax(0,1fr)]", className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelCls}>
          {label}
        </label>
      ) : (
        <div id={id} className={labelCls}>
          {label}
        </div>
      )}
      <div className="min-w-0" role={htmlFor ? undefined : "group"} aria-labelledby={htmlFor ? undefined : id}>
        {children}
      </div>
    </div>
  );
}

function listToText(list: string[]) {
  return list.join(", ");
}
function textToList(text: string) {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Text input that commits a parsed list on blur, so typing commas doesn't fight the parser. */
function ListField({ value, onChange, placeholder, className }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; className?: string }) {
  const [text, setText] = useState(listToText(value));
  useEffect(() => setText(listToText(value)), [value]);
  return (
    <input
      aria-label={placeholder}
      className={cx(pillField, "h-11 bg-field", className)}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(textToList(text))}
    />
  );
}

/* ------------------------------------------------------------------ pill summaries */

export function genreSummary(f: Filters): string {
  if (!f.genres.length) return "Any genre";
  const names = f.genres.map((g) => GENRES.find((x) => x.code === g)?.label ?? g);
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export function yearSummary(f: Filters): string {
  const { yearFrom: from, yearTo: to } = f;
  if (from == null && to == null) return "Any year";
  if (from == null) return `Before ${(to ?? 0) + 1}`;
  if (to == null) return `Since ${from}`;
  if (from === to) return `${from}`;
  if (from % 10 === 0 && to === from + 9) return `${from}s`;
  return `${from}–${to}`;
}

export function roundsSummary(s: GameSettings): string {
  if (s.rounds === 0) return s.mode === "higherlower" ? "Until you miss" : "Every song";
  return `${s.rounds} round${s.rounds === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ popover pickers */

export function GenrePicker({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = (genres: GenreCode[]) => onChange({ ...filters, genres });
  return (
    <ChoiceLine>
      <Chip selected={filters.genres.length === 0} onClick={() => set([])}>
        Any
      </Chip>
      {GENRES.map((g) => (
        <Chip key={g.code} selected={filters.genres.includes(g.code)} onClick={() => set(filters.genres.includes(g.code) ? filters.genres.filter((x) => x !== g.code) : [...filters.genres, g.code])}>
          {g.label}
        </Chip>
      ))}
    </ChoiceLine>
  );
}

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

function decadeOn(f: Filters, d: number) {
  if (f.yearFrom == null && f.yearTo == null) return false;
  return (f.yearFrom ?? -Infinity) <= d && (f.yearTo ?? Infinity) >= d + 9;
}

/** Decade chips select a contiguous range: click to add a neighbour, click an end to drop it. */
function clickDecade(f: Filters, d: number): [number | null, number | null] {
  const on = DECADES.filter((x) => decadeOn(f, x));
  if (!on.length) return [d, d + 9];
  const lo = on[0];
  const hi = on[on.length - 1];
  if (decadeOn(f, d)) {
    if (lo === hi) return [null, null];
    if (d === lo) return [d + 10, f.yearTo];
    if (d === hi) return [f.yearFrom, d - 1];
    return [d, d + 9];
  }
  return [f.yearFrom == null ? null : Math.min(f.yearFrom, d), f.yearTo == null ? null : Math.max(f.yearTo, d + 9)];
}

export function YearPicker({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const id = useId();
  const set = (yearFrom: number | null, yearTo: number | null) => onChange({ ...filters, yearFrom, yearTo });
  return (
    <div className="space-y-4">
      <ChoiceLine>
        <Chip selected={filters.yearFrom == null && filters.yearTo == null} onClick={() => set(null, null)}>
          Any
        </Chip>
        {DECADES.map((d) => (
          <Chip key={d} selected={decadeOn(filters, d)} onClick={() => set(...clickDecade(filters, d))} className="tabular">
            {d}s
          </Chip>
        ))}
      </ChoiceLine>
      <div className="flex items-center gap-3 text-[17px] text-ink-3">
        <label htmlFor={`${id}-from`}>From</label>
        <NumberField id={`${id}-from`} className="w-24" value={filters.yearFrom} onChange={(v) => set(v, filters.yearTo)} placeholder="Any" min={1900} max={2100} />
        <label htmlFor={`${id}-to`}>to</label>
        <NumberField id={`${id}-to`} className="w-24" value={filters.yearTo} onChange={(v) => set(filters.yearFrom, v)} placeholder="Any" min={1900} max={2100} />
      </div>
    </div>
  );
}

const ROUND_PRESETS = [5, 10, 20, 50];

export function RoundsPicker({ settings, onChange }: { settings: GameSettings; onChange: (s: GameSettings) => void }) {
  const id = useId();
  const set = (rounds: number) => onChange({ ...settings, rounds });
  const custom = settings.rounds !== 0 && !ROUND_PRESETS.includes(settings.rounds);
  return (
    <ChoiceLine>
      {ROUND_PRESETS.map((n) => (
        <Chip key={n} selected={settings.rounds === n} onClick={() => set(n)} className="tabular">
          {n}
        </Chip>
      ))}
      <Chip selected={settings.rounds === 0} onClick={() => set(0)}>
        {settings.mode === "higherlower" ? "Until you miss" : "Every song"}
      </Chip>
      <label htmlFor={id} className="sr-only">
        Number of rounds
      </label>
      <NumberField
        id={id}
        className={cx("w-24", custom && "border-ink")}
        value={custom ? settings.rounds : null}
        placeholder="Other"
        min={1}
        max={500}
        onChange={(v) => v && set(Math.max(1, Math.min(500, Math.round(v))))}
      />
    </ChoiceLine>
  );
}

/* ------------------------------------------------------------------ option rows */

const sameSteps = (a: number[], b: number[]) => a.join() === b.join();
const stepSpan = (steps: number[]) => `${formatSeconds(steps[0])} to ${formatSeconds(steps[steps.length - 1])}`;

export function SnippetsRow({ settings, onChange }: { settings: GameSettings; onChange: (s: GameSettings) => void }) {
  const preset = STEP_PRESETS.find((p) => sameSteps(p.steps, settings.steps));
  const [custom, setCustom] = useState(!preset);
  const [text, setText] = useState(settings.steps.join(", "));
  useEffect(() => setText(settings.steps.join(", ")), [settings.steps]);
  const set = (steps: number[]) => onChange({ ...settings, steps });
  return (
    <OptionRow label="Snippets">
      <ChoiceLine>
        {STEP_PRESETS.map((p) => (
          <Chip
            key={p.label}
            selected={!custom && sameSteps(p.steps, settings.steps)}
            onClick={() => {
              setCustom(false);
              set(p.steps);
            }}
            className="tabular"
          >
            {stepSpan(p.steps)}
          </Chip>
        ))}
        <Chip selected={custom} onClick={() => setCustom(true)}>
          Custom
        </Chip>
        {custom && (
          <input
            className={cx(pillField, "h-11 w-60 bg-field tabular")}
            aria-label="Snippet lengths in seconds"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              const steps = [...new Set(text.split(/[,\s]+/).map(Number).filter((n) => n > 0 && n <= 30))].sort((a, b) => a - b);
              if (steps.length) set(steps);
              else setText(settings.steps.join(", "));
            }}
            placeholder="0.1, 0.5, 1, 2, 4, 8, 16"
          />
        )}
      </ChoiceLine>
    </OptionRow>
  );
}

const START_OPTIONS: Record<Engine, [StartMode, string][]> = {
  preview: [
    ["beginning", "Start of the clip"],
    ["middle", "Middle of the clip"],
    ["random", "Random"],
  ],
  spotify: [
    ["beginning", "Start of the song"],
    ["middle", "Middle of the song"],
    ["random", "Random"],
  ],
};

export function StartRow({ settings, onChange }: { settings: GameSettings; onChange: (s: GameSettings) => void }) {
  return (
    <OptionRow label="Starts at">
      <ChoiceLine>
        {START_OPTIONS[settings.engine].map(([value, label]) => (
          <Chip key={value} selected={settings.startMode === value} onClick={() => onChange({ ...settings, startMode: value })}>
            {label}
          </Chip>
        ))}
      </ChoiceLine>
    </OptionRow>
  );
}

export function ArtistsRow({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const id = useId();
  return (
    <OptionRow label="Artists">
      <div className="flex flex-wrap items-center gap-2.5">
        <ListField className="sm:w-[300px]" value={filters.onlyArtists} onChange={(v) => onChange({ ...filters, onlyArtists: v })} placeholder="Only these artists" />
        <ListField className="sm:w-[300px]" value={filters.excludeArtists} onChange={(v) => onChange({ ...filters, excludeArtists: v })} placeholder="Skip these artists" />
        <label htmlFor={id} className="sr-only">
          Max songs per artist
        </label>
        <NumberField
          id={id}
          className="w-[190px]"
          value={filters.maxPerArtist || null}
          onChange={(v) => onChange({ ...filters, maxPerArtist: Math.max(0, Math.round(v ?? 0)) })}
          min={0}
          placeholder="No limit"
          suffix="per artist"
        />
      </div>
    </OptionRow>
  );
}

export function SkipRow({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  return (
    <OptionRow label="Skip">
      <ChoiceLine>
        <Chip selected={filters.excludeVersions} onClick={() => onChange({ ...filters, excludeVersions: !filters.excludeVersions })}>
          Live and remix versions
        </Chip>
        <Chip selected={filters.excludeExplicit} onClick={() => onChange({ ...filters, excludeExplicit: !filters.excludeExplicit })}>
          Explicit songs
        </Chip>
      </ChoiceLine>
    </OptionRow>
  );
}

export function AudioRow({ settings, onChange }: { settings: GameSettings; onChange: (s: GameSettings) => void }) {
  const fullTrackReady = isConnected() && hasScopes(PLAYBACK_SCOPES);
  const options: [Engine, string][] = [
    ["preview", "30s previews"],
    ["spotify", "Full tracks (Spotify Premium)"],
  ];
  return (
    <OptionRow label="Audio">
      <ChoiceLine>
        {options.map(([value, label]) => (
          <Chip key={value} selected={settings.engine === value} onClick={() => onChange({ ...settings, engine: value })}>
            {label}
          </Chip>
        ))}
      </ChoiceLine>
      {settings.engine === "spotify" && !fullTrackReady && (
        <div className="mt-3">
          <ConnectButton playback label={isConnected() ? "Allow playback in Spotify" : "Connect Spotify Premium"} />
        </div>
      )}
    </OptionRow>
  );
}

/** Suggestions while typing, artist strictness and how deep artist sources go. */
export function GuessingRows({ settings, onChange }: { settings: GameSettings; onChange: (s: GameSettings) => void }) {
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => onChange({ ...settings, [k]: v });
  const id = useId();
  const scopes: ["any" | "pool", string][] = [
    ["any", "Any song"],
    ["pool", "Songs in this game"],
  ];
  return (
    <>
      <OptionRow label="Suggestions">
        <ChoiceLine>
          {scopes.map(([value, label]) => (
            <Chip key={value} selected={settings.answerScope === value} onClick={() => set("answerScope", value)}>
              {label}
            </Chip>
          ))}
        </ChoiceLine>
      </OptionRow>
      <OptionRow label="Answers">
        <Chip selected={settings.strictArtist} onClick={() => set("strictArtist", !settings.strictArtist)}>
          Artist must match
        </Chip>
      </OptionRow>
      <OptionRow label="Artist sources" htmlFor={id}>
        <NumberField id={id} className="w-[170px]" value={settings.tracksPerArtist} onChange={(v) => set("tracksPerArtist", Math.max(1, Math.min(100, Math.round(v ?? 10))))} min={1} max={100} suffix="songs each" />
      </OptionRow>
    </>
  );
}

/* ------------------------------------------------------------------ panels */

export function ScoringPanel({ settings, onChange }: { settings: GameSettings; onChange: (s: GameSettings) => void }) {
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => onChange({ ...settings, [k]: v });
  const id = useId();
  return (
    <>
      <OptionRow label="Points" htmlFor={`${id}-max`}>
        <NumberField id={`${id}-max`} className="w-32" value={settings.maxPoints} onChange={(v) => set("maxPoints", Math.max(1, Math.round(v ?? 1000)))} min={1} suffix="pts" />
      </OptionRow>
      <OptionRow label="Penalty" htmlFor={`${id}-penalty`}>
        <NumberField id={`${id}-penalty`} className="w-32" value={settings.wrongPenalty} onChange={(v) => set("wrongPenalty", Math.max(0, Math.round(v ?? 0)))} min={0} suffix="pts" />
      </OptionRow>
      <OptionRow label="Wrong guess">
        <ChoiceLine>
          <Chip selected={!settings.wrongUnlocks} onClick={() => set("wrongUnlocks", false)}>
            Same snippet
          </Chip>
          <Chip selected={settings.wrongUnlocks} onClick={() => set("wrongUnlocks", true)}>
            Next snippet
          </Chip>
        </ChoiceLine>
      </OptionRow>
      <OptionRow label="Worth">
        <ScoreScale settings={settings} className="max-w-[620px] pt-1" />
      </OptionRow>
    </>
  );
}

/** Every filter as option rows. */
export function FiltersPanel({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  return (
    <div className="space-y-6">
      <OptionRow label="Years">
        <YearPicker filters={filters} onChange={onChange} />
      </OptionRow>
      <OptionRow label="Genres">
        <GenrePicker filters={filters} onChange={onChange} />
      </OptionRow>
      <ArtistsRow filters={filters} onChange={onChange} />
      <SkipRow filters={filters} onChange={onChange} />
    </div>
  );
}

/** Rounds, snippets, start point, audio and guessing as option rows. */
export function GamePanel({ settings, onChange }: { settings: GameSettings; onChange: (s: GameSettings) => void }) {
  return (
    <div className="space-y-6">
      <OptionRow label="Rounds">
        <RoundsPicker settings={settings} onChange={onChange} />
      </OptionRow>
      <SnippetsRow settings={settings} onChange={onChange} />
      <StartRow settings={settings} onChange={onChange} />
      <AudioRow settings={settings} onChange={onChange} />
      <GuessingRows settings={settings} onChange={onChange} />
    </div>
  );
}
