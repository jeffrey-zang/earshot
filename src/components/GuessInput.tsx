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
        <label htmlFor="guess" className="sr-only">
          Your guess
        </label>
        <input
          id="guess"
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
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="guess-suggestions"
          aria-activedescendant={active >= 0 ? `guess-opt-${active}` : undefined}
          placeholder="Know it? Type the song"
          autoComplete="off"
          spellCheck={false}
          className="h-14 w-full min-w-0 flex-1 border-2 border-ink bg-field px-3.5 text-[17px] text-ink outline-none focus:bg-white focus-visible:outline-none placeholder:text-ink-3 disabled:opacity-50"
        />
        <button type="submit" disabled={disabled || !q.trim()} className="h-14 bg-ink px-5 text-base font-bold text-paper transition-colors hover:bg-black disabled:opacity-30">
          Guess
        </button>
      </form>
      {open && suggestions.length > 0 && (
        <ul id="guess-suggestions" role="listbox" className="absolute bottom-full z-20 mb-2 max-h-80 w-full overflow-y-auto border border-ink bg-field py-1 sm:bottom-auto sm:top-full sm:mb-0 sm:mt-2">
          {suggestions.map((s, i) => (
            <li key={s.key + i} id={`guess-opt-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(s)}
                onMouseEnter={() => setActive(i)}
                className={cx("flex min-h-[52px] w-full flex-col justify-center px-3.5 py-2 text-left", i === active ? "bg-ink text-paper" : "text-ink")}
              >
                <span className="truncate text-[15px] font-semibold">{s.title}</span>
                <span className={cx("truncate text-[13px]", i === active ? "text-paper/75" : "text-ink-2")}>{s.artist}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
