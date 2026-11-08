"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/types";
import { cleanTitle, normArtist, normTitle, searchScore } from "@/lib/text";
import { dzSearchTracks } from "@/lib/deezer";
import { cx } from "./ui";

export interface GuessValue {
  title: string;
  artist?: string;
}

interface Suggestion {
  key: string;
  title: string;
  artist: string;
}

interface Props {
  pool: Track[];
  scope: "any" | "pool";
  disabled?: boolean;
  onGuess: (g: GuessValue) => void;
  /** Called when space is pressed in an empty box (play shortcut). */
  onEmptySpace?: () => void;
  shake?: number;
}

export function GuessInput({ pool, scope, disabled, onGuess, onEmptySpace, shake }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (!shake) return;
    setShaking(true);
    const id = setTimeout(() => setShaking(false), 250);
    return () => clearTimeout(id);
  }, [shake]);

  const local = useMemo<Suggestion[]>(() => {
    if (q.trim().length < 1) return [];
    const scored: { s: number; t: Track }[] = [];
    for (const t of pool) {
      const s = searchScore(q, t.title, t.artists);
      if (s > 0) scored.push({ s, t });
    }
    scored.sort((a, b) => b.s - a.s || a.t.title.length - b.t.title.length);
    return scored.slice(0, scope === "pool" ? 8 : 5).map(({ t }) => ({ key: t.key, title: cleanTitle(t.title), artist: t.artists.join(", ") }));
  }, [q, pool, scope]);

  useEffect(() => {
    if (scope !== "any" || q.trim().length < 2) {
      setRemote([]);
      return;
    }
    const query = q.trim();
    const id = setTimeout(() => {
      dzSearchTracks(query, 10)
        .then((r) => setRemote(r.map((t) => ({ key: `dz:${t.id}`, title: cleanTitle(t.title), artist: t.artist.name }))))
        .catch(() => setRemote([]));
    }, 220);
    return () => clearTimeout(id);
  }, [q, scope]);

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: Suggestion[] = [];
    for (const s of [...local, ...remote]) {
      const k = `${normTitle(s.title)}|${normArtist(s.artist.split(",")[0])}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
      if (out.length >= 8) break;
    }
    return out;
  }, [local, remote]);

  useEffect(() => setActive(-1), [q]);

  function submit(s?: Suggestion) {
    const value = s ? { title: s.title, artist: s.artist } : { title: q.trim() };
    if (!value.title) return;
    onGuess(value);
    setQ("");
    setOpen(false);
    setRemote([]);
  }

  return (
    <div className={cx("relative", shaking && "animate-shake")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(active >= 0 ? suggestions[active] : undefined);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="9" r="6" />
            <path d="M14 14l4 4" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            disabled={disabled}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === " " && q === "" && onEmptySpace) {
                e.preventDefault();
                onEmptySpace();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(suggestions.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(-1, a - 1));
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Know it? Search for the song"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl bg-panel2 py-3 pl-10 pr-3 text-fg outline-none ring-1 ring-line placeholder:text-faint focus:ring-accent/60 disabled:opacity-50"
          />
        </div>
        <button type="submit" disabled={disabled || !q.trim()} className="rounded-xl bg-fg px-5 font-semibold text-ink transition hover:brightness-90 disabled:opacity-30">
          Guess
        </button>
      </form>
      {open && suggestions.length > 0 && (
        <ul className="absolute bottom-full z-20 mb-2 max-h-80 w-full overflow-y-auto rounded-xl bg-panel2 py-1 shadow-2xl ring-1 ring-line sm:bottom-auto sm:top-full sm:mb-0 sm:mt-2">
          {suggestions.map((s, i) => (
            <li key={s.key + i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(s)}
                onMouseEnter={() => setActive(i)}
                className={cx("flex w-full flex-col px-4 py-2 text-left", i === active ? "bg-line" : "hover:bg-line/60")}
              >
                <span className="truncate text-sm text-fg">{s.title}</span>
                <span className="truncate text-xs text-dim">{s.artist}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
