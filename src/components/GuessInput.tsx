"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/types";
import { cleanTitle, normArtist, normTitle, searchScore } from "@/lib/text";
import { dz, dzSearchArtists, dzSearchTracks, type DzList } from "@/lib/deezer";
import { cx } from "./ui";

export interface GuessValue {
  title: string;
  artist?: string;
}

export interface Suggestion {
  key: string;
  /** Main text: what gets submitted. */
  title: string;
  /** Secondary line. */
  artist?: string;
}

interface SuggestProps {
  id: string;
  label: string;
  placeholder: string;
  /** Local matches for the query (sync). */
  local: (q: string) => Suggestion[];
  /** Remote matches (async), optional. */
  remote?: (q: string) => Promise<Suggestion[]>;
  dedupeKey?: (s: Suggestion) => string;
  disabled?: boolean;
  onSubmit: (s: Suggestion | { title: string; artist?: undefined }) => void;
  onEmptySpace?: () => void;
  shake?: number;
  compact?: boolean;
  buttonLabel?: string;
}

/** Text box with a suggestion list. Picking a suggestion (click or Enter) submits it. */
export function SuggestInput({ id, label, placeholder, local, remote, dedupeKey, disabled, onSubmit, onEmptySpace, shake, compact, buttonLabel = "Guess" }: SuggestProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remoteItems, setRemoteItems] = useState<Suggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (!shake) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 250);
    return () => clearTimeout(t);
  }, [shake]);

  const localItems = useMemo(() => (q.trim() ? local(q) : []), [q, local]);

  useEffect(() => {
    if (!remote || q.trim().length < 2) {
      setRemoteItems([]);
      return;
    }
    const query = q.trim();
    const t = setTimeout(() => {
      remote(query)
        .then(setRemoteItems)
        .catch(() => setRemoteItems([]));
    }, 220);
    return () => clearTimeout(t);
  }, [q, remote]);

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: Suggestion[] = [];
    for (const s of [...localItems, ...remoteItems]) {
      const k = dedupeKey ? dedupeKey(s) : `${normTitle(s.title)}|${normArtist((s.artist ?? "").split(",")[0])}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
      if (out.length >= 8) break;
    }
    return out;
  }, [localItems, remoteItems, dedupeKey]);

  useEffect(() => setActive(-1), [q]);

  function submit(s?: Suggestion) {
    const value = s ?? { title: q.trim() };
    if (!value.title) return;
    onSubmit(value);
    setQ("");
    setOpen(false);
    setRemoteItems([]);
  }

  const h = compact ? "h-12" : "h-14";
  return (
    <div className={cx("relative", shaking && "animate-shake")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(active >= 0 ? suggestions[active] : undefined);
        }}
        className="flex gap-2"
      >
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input
          id={id}
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
          aria-controls={`${id}-suggestions`}
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={cx(h, "w-full min-w-0 flex-1 border-2 border-ink bg-field px-3.5 text-[17px] text-ink outline-none focus:bg-white focus-visible:outline-none placeholder:text-ink-3 disabled:opacity-50")}
        />
        <button type="submit" disabled={disabled || !q.trim()} className={cx(h, "bg-ink px-5 text-base font-bold text-paper transition-colors hover:bg-black disabled:opacity-30")}>
          {buttonLabel}
        </button>
      </form>
      {open && suggestions.length > 0 && (
        <ul id={`${id}-suggestions`} role="listbox" className="absolute bottom-full z-20 mb-2 max-h-80 w-full overflow-y-auto border border-ink bg-field py-1 sm:bottom-auto sm:top-full sm:mb-0 sm:mt-2">
          {suggestions.map((s, i) => (
            <li key={s.key + i} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(s)}
                onMouseEnter={() => setActive(i)}
                className={cx("flex min-h-[52px] w-full flex-col justify-center px-3.5 py-2 text-left", i === active ? "bg-ink text-paper" : "text-ink")}
              >
                <span className="truncate text-[15px] font-semibold">{s.title}</span>
                {s.artist && <span className={cx("truncate text-[13px]", i === active ? "text-paper/75" : "text-ink-2")}>{s.artist}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface GuessProps {
  pool: Track[];
  scope: "any" | "pool";
  disabled?: boolean;
  onGuess: (g: GuessValue) => void;
  /** Called when space is pressed in an empty box (play shortcut). */
  onEmptySpace?: () => void;
  shake?: number;
  /** Hide artists in suggestions (when the artist is a separate question). */
  hideArtist?: boolean;
  compact?: boolean;
  id?: string;
}

/** Song title guess. */
export function GuessInput({ pool, scope, disabled, onGuess, onEmptySpace, shake, hideArtist, compact, id = "guess" }: GuessProps) {
  const local = useMemo(
    () => (q: string) => {
      const scored: { s: number; t: Track }[] = [];
      for (const t of pool) {
        const s = hideArtist ? searchScore(q, t.title, []) : searchScore(q, t.title, t.artists);
        if (s > 0) scored.push({ s, t });
      }
      scored.sort((a, b) => b.s - a.s || a.t.title.length - b.t.title.length);
      return scored.slice(0, scope === "pool" ? 8 : 5).map(({ t }) => ({ key: t.key, title: cleanTitle(t.title), artist: hideArtist ? undefined : t.artists.join(", ") }));
    },
    [pool, scope, hideArtist],
  );
  const remote = useMemo(
    () =>
      scope === "any"
        ? async (q: string) => (await dzSearchTracks(q, 10)).map((t) => ({ key: `dz:${t.id}`, title: cleanTitle(t.title), artist: hideArtist ? undefined : t.artist.name }))
        : undefined,
    [scope, hideArtist],
  );
  return (
    <SuggestInput
      id={id}
      label="Song title"
      placeholder={compact ? "Song title" : "Know it? Type the song"}
      local={local}
      remote={remote}
      dedupeKey={hideArtist ? (s) => normTitle(s.title) : undefined}
      disabled={disabled}
      onSubmit={(s) => onGuess({ title: s.title, artist: s.artist })}
      onEmptySpace={onEmptySpace}
      shake={shake}
      compact={compact}
    />
  );
}

/** Artist guess: artists in the pool first, then any artist. */
export function ArtistInput({ pool, scope, onGuess, onEmptySpace, shake }: { pool: Track[]; scope: "any" | "pool"; onGuess: (name: string) => void; onEmptySpace?: () => void; shake?: number }) {
  const names = useMemo(() => [...new Set(pool.flatMap((t) => t.artists))], [pool]);
  const local = useMemo(
    () => (q: string) =>
      names
        .map((n) => ({ n, s: searchScore(q, n, []) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.n.length - b.n.length)
        .slice(0, 6)
        .map(({ n }) => ({ key: `a:${n}`, title: n })),
    [names],
  );
  const remote = useMemo(() => (scope === "any" ? async (q: string) => (await dzSearchArtists(q, 6)).map((a) => ({ key: `dza:${a.id}`, title: a.name })) : undefined), [scope]);
  return (
    <SuggestInput
      id="guess-artist"
      label="Artist"
      placeholder="Artist"
      local={local}
      remote={remote}
      dedupeKey={(s) => normArtist(s.title)}
      onSubmit={(s) => onGuess(s.title)}
      onEmptySpace={onEmptySpace}
      shake={shake}
      compact
    />
  );
}

/** Album guess: albums in the pool first, then any album. */
export function AlbumInput({ pool, scope, onGuess, onEmptySpace, shake }: { pool: Track[]; scope: "any" | "pool"; onGuess: (name: string) => void; onEmptySpace?: () => void; shake?: number }) {
  const albums = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of pool) if (t.album) m.set(t.album, t.artists[0] ?? "");
    return [...m.entries()];
  }, [pool]);
  const local = useMemo(
    () => (q: string) =>
      albums
        .map(([a, artist]) => ({ a, artist, s: searchScore(q, a, []) }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s)
        .slice(0, 6)
        .map(({ a, artist }) => ({ key: `al:${a}`, title: cleanTitle(a), artist })),
    [albums],
  );
  const remote = useMemo(
    () =>
      scope === "any"
        ? async (q: string) => {
            const r = await dz<DzList<{ id: number; title: string; artist?: { name: string } }>>("search/album", { q, limit: 8 });
            return (r.data ?? []).map((a) => ({ key: `dzal:${a.id}`, title: cleanTitle(a.title), artist: a.artist?.name }));
          }
        : undefined,
    [scope],
  );
  return <SuggestInput id="guess-album" label="Album" placeholder="Album" local={local} remote={remote} onSubmit={(s) => onGuess(s.title)} onEmptySpace={onEmptySpace} shake={shake} compact />;
}
