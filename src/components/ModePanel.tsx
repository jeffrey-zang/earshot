"use client";

import { useEffect, useState } from "react";
import type { AnswerField, GameMode, GameSettings, HLMetric, Twist } from "@/lib/types";
import { FIELD_INFO, FIELD_ORDER, HL_INFO, TWIST_INFO } from "@/lib/modes";
import { lastfmEnabled } from "@/lib/lastfm";
import { Chip, ChoiceLine, Label, NumberField, Segmented, TextField, cx } from "./ui";

export interface ModeContext {
  /** Spotify library sources (with saved dates) are in the game. */
  savedDates: boolean;
  playlists: number;
}

const MODES: { value: GameMode; label: string; blurb: string }[] = [
  { value: "classic", label: "Name it", blurb: "Hear a sliver, then name the song, artist, album, year or more. Mix as many as you like." },
  { value: "lyrics", label: "Finish the lyric", blurb: "Hear the seconds before a line (or read the line before it) and type what comes next." },
  { value: "higherlower", label: "Higher or lower", blurb: "Two songs. Which came out later, is more popular, has more plays, or did you save first?" },
];

export function ModePanel({ settings, onChange, ctx }: { settings: GameSettings; onChange: (s: GameSettings) => void; ctx: ModeContext }) {
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => onChange({ ...settings, [k]: v });
  const [lastfm, setLastfm] = useState<boolean | null>(null);
  useEffect(() => {
    lastfmEnabled().then(setLastfm);
  }, []);

  const reason = (f: AnswerField): string | null => {
    const need = FIELD_INFO[f].needs;
    if (need === "spotify" && !ctx.savedDates) return "Add your Spotify Liked Songs, playlists or saved albums";
    if ((need === "lastfm" || need === "lastfmUser") && lastfm === false) return "Needs a Last.fm API key on the server";
    if (need === "playlists" && ctx.playlists < 2) return "Add two or more playlists";
    return null;
  };
  const toggleField = (f: AnswerField) => {
    const has = settings.fields.includes(f);
    const next = has ? settings.fields.filter((x) => x !== f) : FIELD_ORDER.filter((x) => x === f || settings.fields.includes(x));
    set("fields", next.length ? next : ["title"]);
  };
  const hlReason = (m: HLMetric) => (HL_INFO[m].needs === "lastfm" && lastfm === false ? "needs Last.fm" : HL_INFO[m].needs === "spotify" && !ctx.savedDates ? "needs your Spotify library" : null);
  const current = MODES.find((m) => m.value === settings.mode) ?? MODES[0];

  return (
    <div className="space-y-6">
      <div>
        <Segmented<GameMode> value={settings.mode} onChange={(v) => set("mode", v)} options={MODES.map((m) => ({ value: m.value, label: m.label }))} />
        <p className="mt-1 max-w-[560px] text-ink-2">{current.blurb}</p>
      </div>

      {settings.mode === "classic" && (
        <>
          <div>
            <Label>Ask for</Label>
            <ChoiceLine>
              {FIELD_ORDER.map((f) => {
                const why = reason(f);
                return (
                  <Chip key={f} selected={settings.fields.includes(f)} onClick={() => toggleField(f)} title={why ?? FIELD_INFO[f].hint} className={cx(why && !settings.fields.includes(f) && "text-ink-3")}>
                    {FIELD_INFO[f].label}
                  </Chip>
                );
              })}
            </ChoiceLine>
            <ul className="mt-1 space-y-0.5 text-sm text-ink-2">
              {settings.fields.map((f) => {
                const why = reason(f);
                return (
                  <li key={f}>
                    <span className="font-semibold text-ink">{FIELD_INFO[f].label}:</span> {FIELD_INFO[f].hint}
                    {why && <span className="text-error"> {why}.</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          {(settings.fields.includes("myplays") || settings.fields.includes("plays")) && (
            <div>
              <Label htmlFor="lastfm-user">Last.fm username</Label>
              <TextField id="lastfm-user" className="max-w-xs" value={settings.lastfmUser} placeholder="For “your plays”" onChange={(e) => set("lastfmUser", e.target.value)} />
              <p className="mt-1 text-sm text-ink-2">Spotify doesn&apos;t share play counts, so plays come from Last.fm scrobbles.</p>
            </div>
          )}
          <div>
            <Label>Twist</Label>
            <Segmented<Twist> value={settings.twist} onChange={(v) => set("twist", v)} options={(Object.keys(TWIST_INFO) as Twist[]).map((t) => ({ value: t, label: TWIST_INFO[t].label }))} />
            {settings.twist !== "none" && <p className="mt-1 text-sm text-ink-2">{TWIST_INFO[settings.twist].hint} Works with 30s previews; full Spotify tracks play normally.</p>}
          </div>
        </>
      )}

      {settings.mode === "lyrics" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label htmlFor="lyric-lead" className="font-semibold">
              Seconds before the line
            </label>
            <NumberField id="lyric-lead" className="w-20" value={settings.lyricLead} min={2} max={15} onChange={(v) => set("lyricLead", Math.max(2, Math.min(15, Math.round(v ?? 5))))} />
          </div>
          <p className="max-w-[560px] text-sm text-ink-2">
            Lining audio up with lyrics needs the full track, so that part uses Spotify Premium (Audio: full tracks under Change). With 30s previews you get the line before as text instead. Close answers score for every word in the right order. Lyrics from LRCLIB.
          </p>
        </div>
      )}

      {settings.mode === "higherlower" && (
        <div className="space-y-4">
          <div>
            <Label>Compare</Label>
            <ChoiceLine>
              {(Object.keys(HL_INFO) as HLMetric[]).map((m) => {
                const why = hlReason(m);
                return (
                  <Chip key={m} selected={settings.hlMetric === m} onClick={() => set("hlMetric", m)} title={why ?? undefined} className={cx(why && settings.hlMetric !== m && "text-ink-3")}>
                    {HL_INFO[m].label}
                  </Chip>
                );
              })}
            </ChoiceLine>
            {hlReason(settings.hlMetric) && <p className="mt-1 text-sm text-error">This one {hlReason(settings.hlMetric)}.</p>}
            {settings.hlMetric === "popularity" && <p className="mt-1 text-sm text-ink-2">Popularity is Deezer&apos;s rank, based on recent listening.</p>}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="hl-lives" className="font-semibold">
              Lives
            </label>
            <NumberField id="hl-lives" className="w-20" value={settings.hlLives} min={1} max={10} onChange={(v) => set("hlLives", Math.max(1, Math.min(10, Math.round(v ?? 1))))} />
            <span className="text-sm text-ink-2">The run ends when you run out.</span>
          </div>
        </div>
      )}
    </div>
  );
}
