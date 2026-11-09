"use client";

import { useEffect, useState } from "react";
import type { Engine, Filters, GameSettings, GenreCode, StartMode } from "@/lib/types";
import { GENRES } from "@/lib/genres";
import { STEP_PRESETS } from "@/lib/settings";
import { Chip, ChoiceLine, Label, NumberField, Segmented, TextField, Toggle, cx } from "./ui";
import { ConnectButton } from "./SpotifyConnect";
import { ScoreScale } from "./SnippetBar";
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
function ListField({ id, value, onChange, placeholder }: { id: string; value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState(listToText(value));
  useEffect(() => setText(listToText(value)), [value]);
  return <TextField id={id} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(textToList(text))} />;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm text-ink-2">{children}</p>;
}

/** Label and help on the left, a compact control on the right. */
function Row({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-ink-2">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

export function FiltersPanel({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  const toggleGenre = (g: GenreCode) => set("genres", filters.genres.includes(g) ? filters.genres.filter((x) => x !== g) : [...filters.genres, g]);
  return (
    <div className="space-y-8">
      <div>
        <Label>Release year</Label>
        <ChoiceLine>
          {YEAR_PRESETS.map((p) => (
            <Chip key={p.label} selected={filters.yearFrom === p.from && filters.yearTo === p.to} onClick={() => onChange({ ...filters, yearFrom: p.from, yearTo: p.to })}>
              {p.label}
            </Chip>
          ))}
        </ChoiceLine>
        <div className="mt-2 flex items-center gap-3 text-ink-2">
          <label htmlFor="year-from">From</label>
          <NumberField id="year-from" className="w-24" value={filters.yearFrom} onChange={(v) => set("yearFrom", v)} placeholder="any" min={1900} max={2100} />
          <label htmlFor="year-to">to</label>
          <NumberField id="year-to" className="w-24" value={filters.yearTo} onChange={(v) => set("yearTo", v)} placeholder="any" min={1900} max={2100} />
        </div>
      </div>
      <div>
        <Label>Genres</Label>
        <ChoiceLine>
          <Chip selected={filters.genres.length === 0} onClick={() => set("genres", [])}>
            All genres
          </Chip>
          {GENRES.map((g) => (
            <Chip key={g.code} selected={filters.genres.includes(g.code)} onClick={() => toggleGenre(g.code)}>
              {g.label}
            </Chip>
          ))}
        </ChoiceLine>
        {filters.genres.length > 0 && <Hint>Songs without genre info (most Spotify libraries) are looked up as the game picks them, so the first round can take a moment.</Hint>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="only-artists">Only these artists</Label>
          <ListField id="only-artists" value={filters.onlyArtists} onChange={(v) => set("onlyArtists", v)} placeholder="Queen, ABBA" />
        </div>
        <div>
          <Label htmlFor="never-artists">Never these artists</Label>
          <ListField id="never-artists" value={filters.excludeArtists} onChange={(v) => set("excludeArtists", v)} placeholder="Nickelback" />
        </div>
      </div>
      <div className="divide-y divide-rule border-y border-rule">
        <Toggle checked={filters.excludeVersions} onChange={(v) => set("excludeVersions", v)} label="Skip live, remix and acoustic versions" />
        <Toggle checked={filters.excludeExplicit} onChange={(v) => set("excludeExplicit", v)} label="Skip explicit songs" />
        <Row label="Max songs per artist" hint="0 means no limit.">
          <NumberField className="w-20" value={filters.maxPerArtist} onChange={(v) => set("maxPerArtist", Math.max(0, Math.round(v ?? 0)))} min={0} />
        </Row>
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
    <div className="space-y-8">
      <div>
        <Label>Rounds</Label>
        <ChoiceLine>
          {ROUND_PRESETS.map((n) => (
            <Chip key={n} selected={settings.rounds === n} onClick={() => set("rounds", n)} className="tabular">
              {n}
            </Chip>
          ))}
          <Chip selected={settings.rounds === 0} onClick={() => set("rounds", 0)}>
            Every song
          </Chip>
          <NumberField
            className={cx("w-24", customRounds && "border-ink")}
            value={customRounds ? settings.rounds : null}
            placeholder="Other"
            min={1}
            max={500}
            onChange={(v) => v && set("rounds", Math.max(1, Math.min(500, Math.round(v))))}
          />
        </ChoiceLine>
      </div>
      <div>
        <Label>Snippet lengths</Label>
        <ChoiceLine>
          {STEP_PRESETS.map((p) => (
            <Chip key={p.label} selected={p.steps.join() === settings.steps.join()} onClick={() => set("steps", p.steps)}>
              {p.label}
            </Chip>
          ))}
        </ChoiceLine>
        <TextField
          className="mt-2 tabular"
          aria-label="Snippet lengths in seconds"
          value={stepsText}
          onChange={(e) => setStepsText(e.target.value)}
          onBlur={() => {
            const steps = [...new Set(stepsText.split(/[,\s]+/).map(Number).filter((n) => n > 0 && n <= 30))].sort((a, b) => a - b);
            if (steps.length) set("steps", steps);
            else setStepsText(settings.steps.join(", "));
          }}
          placeholder="0.1, 0.5, 1, 2, 4, 8, 16"
        />
        <Hint>Seconds, comma separated. Each skip or wrong guess unlocks the next length. Previews max out at about 29s.</Hint>
      </div>
      <div>
        <Label>Snippet starts at</Label>
        <Segmented<StartMode>
          value={settings.startMode}
          onChange={(v) => set("startMode", v)}
          options={
            settings.engine === "preview"
              ? [
                  { value: "beginning", label: "Start of the clip" },
                  { value: "middle", label: "Middle of the clip" },
                  { value: "random", label: "Random point" },
                ]
              : [
                  { value: "beginning", label: "The song's first second" },
                  { value: "middle", label: "Middle of the song" },
                  { value: "random", label: "Random point" },
                ]
          }
        />
        <Hint>
          {settings.engine === "preview"
            ? "Free previews are 30-second clips that Spotify, Deezer and Apple cut from the middle of each song, usually around the hook, so no free source can play the real intro. To start at the song's actual beginning, set Audio to full tracks below (Spotify Premium on a computer; Spotify's player doesn't run on iPhone or iPad)."
            : "Full tracks start exactly where you choose. Some songs open with a moment of silence, so the very first snippets can be quiet."}
        </Hint>
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
          <div className="mt-3 bg-paper-2 p-4 text-ink-2">
            <p>Plays the real song through Spotify in this tab. Needs Spotify Premium and a desktop browser. Timing is approximate (about 0.1s) because Spotify controls playback.</p>
            {!fullTrackReady && (
              <div className="mt-3">
                <ConnectButton playback label={isConnected() ? "Allow playback in Spotify" : "Connect Spotify Premium"} />
              </div>
            )}
          </div>
        )}
      </div>
      <div>
        <Label>Guessing</Label>
        <div className="divide-y divide-rule border-y border-rule">
          <div className="py-3">
            <span className="block font-semibold">Suggestions while typing</span>
            <span className="block text-sm text-ink-2">Only my pool is easier: you pick from the songs in this game.</span>
            <Segmented<"any" | "pool">
              value={settings.answerScope}
              onChange={(v) => set("answerScope", v)}
              options={[
                { value: "any", label: "Any song" },
                { value: "pool", label: "Only my pool" },
              ]}
            />
          </div>
          <Toggle checked={settings.strictArtist} onChange={(v) => set("strictArtist", v)} label="Artist must match too" hint="The right title by the wrong artist (a cover, or a different song with the same name) counts as wrong." />
          <Row label="Songs per artist" hint="For artist sources: how deep into their catalog to go.">
            <NumberField className="w-20" value={settings.tracksPerArtist} onChange={(v) => set("tracksPerArtist", Math.max(1, Math.min(100, Math.round(v ?? 10))))} min={1} max={100} />
          </Row>
        </div>
      </div>
    </div>
  );
}

export function ScoringPanel({ settings, onChange }: { settings: GameSettings; onChange: (s: GameSettings) => void }) {
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => onChange({ ...settings, [k]: v });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="max-points">Starting points</Label>
          <NumberField id="max-points" value={settings.maxPoints} onChange={(v) => set("maxPoints", Math.max(1, Math.round(v ?? 1000)))} min={1} className="w-full" />
        </div>
        <div>
          <Label htmlFor="half-life">Points halve every</Label>
          <NumberField id="half-life" value={settings.halfLife} onChange={(v) => set("halfLife", Math.max(0.1, v ?? 3))} step={0.5} min={0.1} suffix="s" className="w-full" />
        </div>
        <div>
          <Label htmlFor="penalty">Wrong guess costs</Label>
          <NumberField id="penalty" value={settings.wrongPenalty} onChange={(v) => set("wrongPenalty", Math.max(0, Math.round(v ?? 0)))} min={0} suffix="pts" className="w-full" />
        </div>
      </div>
      <div className="border-y border-rule">
        <Toggle checked={settings.wrongUnlocks} onChange={(v) => set("wrongUnlocks", v)} label="Wrong guesses unlock the next snippet" hint="Off: you can keep guessing at the same length, paying the penalty each time." />
      </div>
      <div>
        <Label>What a correct guess is worth</Label>
        <ScoreScale settings={settings} className="mt-2" />
      </div>
    </div>
  );
}
