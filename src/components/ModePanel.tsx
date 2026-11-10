"use client";

import { useEffect, useId, useState } from "react";
import type { AnswerField, GameMode, GameSettings, HLMetric, Twist } from "@/lib/types";
import { FIELD_INFO, FIELD_ORDER, HL_INFO, TWIST_INFO } from "@/lib/modes";
import { lastfmEnabled } from "@/lib/lastfm";
import { Chip, ChoiceLine, NumberField, cx } from "./ui";
import { OptionRow, pillField } from "./SettingsPanels";

export interface ModeContext {
  /** Spotify library sources (with saved dates) are in the game. */
  savedDates: boolean;
  playlists: number;
}

const MODES: { value: GameMode; label: string }[] = [
  { value: "classic", label: "Name it" },
  { value: "lyrics", label: "Finish the lyric" },
  { value: "higherlower", label: "Higher or lower" },
];

/** Game, what it asks for and its mode-specific options, as option rows. */
export function ModePanel({ settings, onChange, ctx }: { settings: GameSettings; onChange: (s: GameSettings) => void; ctx: ModeContext }) {
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => onChange({ ...settings, [k]: v });
  const id = useId();
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
  const hlReason = (m: HLMetric) => (HL_INFO[m].needs === "lastfm" && lastfm === false ? "Needs Last.fm" : HL_INFO[m].needs === "spotify" && !ctx.savedDates ? "Needs your Spotify library" : null);
  const blocked = settings.fields.map((f) => [f, reason(f)] as const).filter(([, why]) => why);

  return (
    <>
      <OptionRow label="Game">
        <ChoiceLine>
          {MODES.map((m) => (
            <Chip key={m.value} selected={settings.mode === m.value} onClick={() => set("mode", m.value)}>
              {m.label}
            </Chip>
          ))}
        </ChoiceLine>
      </OptionRow>

      {settings.mode === "classic" && (
        <>
          <OptionRow label="Ask for">
            <ChoiceLine>
              {FIELD_ORDER.map((f) => {
                const why = reason(f);
                const on = settings.fields.includes(f);
                return (
                  <Chip key={f} selected={on} onClick={() => toggleField(f)} title={why ?? FIELD_INFO[f].hint} className={cx(why && !on && "text-ink-3")}>
                    {FIELD_INFO[f].label}
                  </Chip>
                );
              })}
            </ChoiceLine>
            {blocked.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[15px] text-error">
                {blocked.map(([f, why]) => (
                  <li key={f}>
                    {FIELD_INFO[f].label}: {why}
                  </li>
                ))}
              </ul>
            )}
          </OptionRow>
          {(settings.fields.includes("myplays") || settings.fields.includes("plays")) && (
            <OptionRow label="Last.fm user" htmlFor={`${id}-lastfm`}>
              <input id={`${id}-lastfm`} className={cx(pillField, "h-11 bg-field sm:w-[300px]")} value={settings.lastfmUser} placeholder="Username" onChange={(e) => set("lastfmUser", e.target.value)} />
            </OptionRow>
          )}
          <OptionRow label="Twist">
            <ChoiceLine>
              {(Object.keys(TWIST_INFO) as Twist[]).map((t) => (
                <Chip key={t} selected={settings.twist === t} onClick={() => set("twist", t)} title={TWIST_INFO[t].hint || undefined}>
                  {TWIST_INFO[t].label}
                </Chip>
              ))}
            </ChoiceLine>
          </OptionRow>
        </>
      )}

      {settings.mode === "lyrics" && (
        <OptionRow label="Lead-in" htmlFor={`${id}-lead`}>
          <NumberField id={`${id}-lead`} className="w-28" value={settings.lyricLead} min={2} max={15} suffix="s" onChange={(v) => set("lyricLead", Math.max(2, Math.min(15, Math.round(v ?? 5))))} />
        </OptionRow>
      )}

      {settings.mode === "higherlower" && (
        <>
          <OptionRow label="Compare">
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
            {hlReason(settings.hlMetric) && <p className="mt-2 text-[15px] text-error">{hlReason(settings.hlMetric)}</p>}
          </OptionRow>
          <OptionRow label="Lives" htmlFor={`${id}-lives`}>
            <NumberField id={`${id}-lives`} className="w-24" value={settings.hlLives} min={1} max={10} onChange={(v) => set("hlLives", Math.max(1, Math.min(10, Math.round(v ?? 1))))} />
          </OptionRow>
        </>
      )}
    </>
  );
}
