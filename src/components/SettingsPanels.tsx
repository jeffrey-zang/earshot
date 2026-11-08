"use client";

import { useEffect, useState } from "react";
import type { Engine, Filters, GameSettings, GenreCode, StartMode } from "@/lib/types";
import { GENRES } from "@/lib/genres";
import { STEP_PRESETS } from "@/lib/settings";
import { formatSeconds, pointsFor } from "@/lib/scoring";
import { Chip, Label, NumberField, Segmented, TextField, Toggle, cx } from "./ui";
import { ConnectButton } from "./SpotifyConnect";
import { PLAYBACK_SCOPES, hasScopes, isConnected } from "@/lib/spotify/auth";

const YEAR_PRESETS: { label: string; from: number | null; to: number | null }[] = [
  { label: "Any year", from: null, to: null },
  { label: "Before 1980", from: null, to: 1979 },
  { label: "Before 2000", from: null, to: 1999 },
  { label: "60s", from: 1960, to: 1969 },
  { label: "70s", from: 1970, to: 1979 },
  { label: "80s", from: 1980, to: 1989 },
  { label: "90s", from: 1990, to: 1999 },
  { label: "2000s", from: 2000, to: 2009 },
  { label: "2010s", from: 2010, to: 2019 },
  { label: "2020s", from: 2020, to: null },
];

function listToText(list: string[]) {
  return list.join(", ");
}
function textToList(text: string) {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Text input that commits a parsed value on blur, so typing commas doesn't fight the parser. */
function ListField({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState(listToText(value));
  useEffect(() => setText(listToText(value)), [value]);
  return <TextField value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(textToList(text))} />;
}

export function FiltersPanel({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  const toggleGenre = (g: GenreCode) => set("genres", filters.genres.includes(g) ? filters.genres.filter((x) => x !== g) : [...filters.genres, g]);
  return (
    <div className="space-y-6">
      <div>
        <Label>Release year</Label>
        <div className="mb-3 flex flex-wrap gap-2">
          {YEAR_PRESETS.map((p) => (
            <Chip key={p.label} selected={filters.yearFrom === p.from && filters.yearTo === p.to} onClick={() => onChange({ ...filters, yearFrom: p.from, yearTo: p.to })}>
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-dim">
          From <NumberField className="w-24" value={filters.yearFrom} onChange={(v) => set("yearFrom", v)} placeholder="any" min={1900} max={2100} />
          to <NumberField className="w-24" value={filters.yearTo} onChange={(v) => set("yearTo", v)} placeholder="any" min={1900} max={2100} />
        </div>
      </div>
      <div>
        <Label>Genres</Label>
        <div className="flex flex-wrap gap-2">
          <Chip selected={filters.genres.length === 0} onClick={() => set("genres", [])}>All genres</Chip>
          {GENRES.map((g) => (
            <Chip key={g.code} selected={filters.genres.includes(g.code)} onClick={() => toggleGenre(g.code)}>
              {g.label}
            </Chip>
          ))}
        </div>
        {filters.genres.length > 0 && <p className="mt-2 text-xs text-faint">Songs without genre info (most Spotify libraries) get looked up as the game picks them, so the first round can take a moment.</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Only these artists</Label>
          <ListField value={filters.onlyArtists} onChange={(v) => set("onlyArtists", v)} placeholder="e.g. Queen, ABBA" />
        </div>
        <div>
          <Label>Never these artists</Label>
          <ListField value={filters.excludeArtists} onChange={(v) => set("excludeArtists", v)} placeholder="e.g. Nickelback" />
        </div>
      </div>
      <div className="space-y-1">
        <Toggle checked={filters.excludeVersions} onChange={(v) => set("excludeVersions", v)} label="Skip live, remix and acoustic versions" />
        <Toggle checked={filters.excludeExplicit} onChange={(v) => set("excludeExplicit", v)} label="Skip explicit songs" />
        <div className="flex items-center justify-between gap-4 py-1.5">
          <span className="text-sm">
            Max songs per artist
            <span className="block text-xs text-dim">0 means no limit.</span>
          </span>
          <NumberField className="w-20" value={filters.maxPerArtist} onChange={(v) => set("maxPerArtist", Math.max(0, Math.round(v ?? 0)))} min={0} />
        </div>
      </div>
    </div>
  );
}

const ROUND_PRESETS = [5, 10, 20, 50];

export function GamePanel({ settings, onChange }: { settings: GameSettings; onChange: (s: GameSettings) => void }) {
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => onChange({ ...settings, [k]: v });
  const [stepsText, setStepsText] = useState(settings.steps.join(", "));
  useEffect(() => setStepsText(settings.steps.join(", ")), [settings.steps]);
  const customRounds = settings.rounds !== 0 && !ROUND_PRESETS.includes(settings.rounds);
  const fullTrackReady = isConnected() && hasScopes(PLAYBACK_SCOPES);

  return (
    <div className="space-y-6">
      <div>
        <Label>Rounds</Label>
        <div className="flex flex-wrap items-center gap-2">
          {ROUND_PRESETS.map((n) => (
            <Chip key={n} selected={settings.rounds === n} onClick={() => set("rounds", n)}>
              {n}
            </Chip>
          ))}
          <Chip selected={settings.rounds === 0} onClick={() => set("rounds", 0)}>Every song</Chip>
          <NumberField className={cx("w-24", customRounds && "ring-accent/60")} value={customRounds ? settings.rounds : null} placeholder="custom" min={1} max={500} onChange={(v) => v && set("rounds", Math.max(1, Math.min(500, Math.round(v))))} />
        </div>
      </div>
      <div>
        <Label>Snippet starts at</Label>
        <Segmented<StartMode>
          value={settings.startMode}
          onChange={(v) => set("startMode", v)}
          options={[
            { value: "beginning", label: "Beginning" },
            { value: "middle", label: "Middle" },
            { value: "random", label: "Random point" },
          ]}
        />
        <p className="mt-2 text-xs text-faint">
          {settings.engine === "preview"
            ? "Previews are 30-second excerpts picked by the music service (often around the hook), so \"beginning\" is the start of that excerpt, with silence skipped. Use full tracks to start at the true beginning."
            : "Full tracks start exactly where you choose: the first note, the middle, or anywhere."}
        </p>
      </div>
      <div>
        <Label>Audio</Label>
        <Segmented<Engine>
          value={settings.engine}
          onChange={(v) => set("engine", v)}
          options={[
            { value: "preview", label: "30s previews" },
            { value: "spotify", label: "Full tracks (Spotify Premium, beta)" },
          ]}
        />
        {settings.engine === "spotify" && (
          <div className="mt-3 rounded-xl bg-panel2 p-4 text-sm text-dim ring-1 ring-line">
            <p>Plays the real song through Spotify in this tab. Needs Spotify Premium and a desktop browser. Snippet timing is approximate (about 0.1s) because Spotify controls playback.</p>
            {!fullTrackReady && (
              <div className="mt-3">
                <ConnectButton playback label={isConnected() ? "Allow playback in Spotify" : "Connect Spotify Premium"} />
              </div>
            )}
          </div>
        )}
      </div>
      <div>
        <Label>Snippet lengths</Label>
        <div className="mb-3 flex flex-wrap gap-2">
          {STEP_PRESETS.map((p) => (
            <Chip key={p.label} selected={p.steps.join() === settings.steps.join()} onClick={() => set("steps", p.steps)}>
              {p.label}
            </Chip>
          ))}
        </div>
        <TextField
          value={stepsText}
          onChange={(e) => setStepsText(e.target.value)}
          onBlur={() => {
            const steps = [...new Set(stepsText.split(/[,\s]+/).map(Number).filter((n) => n > 0 && n <= 30))].sort((a, b) => a - b);
            if (steps.length) set("steps", steps);
            else setStepsText(settings.steps.join(", "));
          }}
          placeholder="0.1, 0.5, 1, 2, 4, 8, 16"
        />
        <p className="mt-2 text-xs text-faint">Seconds, comma separated. Each skip or wrong guess unlocks the next length. Previews max out at about 29s.</p>
      </div>
      <div className="space-y-1">
        <Label>Guessing</Label>
        <div className="flex flex-wrap items-center justify-between gap-3 py-1.5">
          <span className="text-sm">
            Suggestions while typing
            <span className="block text-xs text-dim">&quot;Only my pool&quot; is easier: you pick from the songs in this game.</span>
          </span>
          <Segmented<"any" | "pool">
            value={settings.answerScope}
            onChange={(v) => set("answerScope", v)}
            options={[
              { value: "any", label: "Any song" },
              { value: "pool", label: "Only my pool" },
            ]}
          />
        </div>
        <Toggle checked={settings.strictArtist} onChange={(v) => set("strictArtist", v)} label="Artist must match too" hint="Picking the right title by the wrong artist (a cover, or a different song with the same name) counts as wrong." />
        <div className="flex items-center justify-between gap-4 py-1.5">
          <span className="text-sm">
            Songs per artist
            <span className="block text-xs text-dim">For artist sources (followed, top or added artists): how deep into their catalog to go.</span>
          </span>
          <NumberField className="w-20" value={settings.tracksPerArtist} onChange={(v) => set("tracksPerArtist", Math.max(1, Math.min(100, Math.round(v ?? 10))))} min={1} max={100} />
        </div>
      </div>
    </div>
  );
}

export function ScoringPanel({ settings, onChange }: { settings: GameSettings; onChange: (s: GameSettings) => void }) {
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => onChange({ ...settings, [k]: v });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Points at first snippet</Label>
          <NumberField value={settings.maxPoints} onChange={(v) => set("maxPoints", Math.max(1, Math.round(v ?? 1000)))} min={1} className="w-full" />
        </div>
        <div>
          <Label>Points halve every</Label>
          <NumberField value={settings.halfLife} onChange={(v) => set("halfLife", Math.max(0.1, v ?? 3))} step={0.5} min={0.1} suffix="s" className="w-full" />
        </div>
        <div>
          <Label>Wrong guess costs</Label>
          <NumberField value={settings.wrongPenalty} onChange={(v) => set("wrongPenalty", Math.max(0, Math.round(v ?? 0)))} min={0} suffix="pts" className="w-full" />
        </div>
      </div>
      <Toggle checked={settings.wrongUnlocks} onChange={(v) => set("wrongUnlocks", v)} label="Wrong guesses unlock the next snippet" hint="Off: you can keep guessing at the same length, paying the penalty each time." />
      <div>
        <Label>What a correct guess is worth</Label>
        <div className="flex flex-wrap gap-2">
          {settings.steps.map((s) => (
            <div key={s} className="rounded-xl bg-panel2 px-3 py-2 text-center ring-1 ring-line">
              <div className="text-xs text-faint">{formatSeconds(s)}</div>
              <div className="font-semibold tabular">{pointsFor(s, settings)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
