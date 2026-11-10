"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/types";
import { cleanTitle, normArtist, normTitle, searchRank } from "@/lib/text";
import { dz, dzSearchArtists, dzSearchTracks, type DzList } from "@/lib/deezer";
import { cx } from "./ui";
import { visibleArea } from "./motion";

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
  /** How well it matches, then how popular it is: local and remote results are ranked together. */
  score?: number;
  pop?: number;
  /** Cover art, shown small beside the song. */
  image?: string;
}

/** A small cover: Deezer takes the size in the URL; Spotify serves a 64px one at the same id. */
function thumb(url?: string): string | undefined {
  if (url?.includes("mzstatic.com")) return url.replace(/\/\d+x\d+bb\.jpg$/, "/120x120bb.jpg");
  if (url?.includes("dzcdn.net")) return url.replace(/\/\d+x\d+-/, "/120x120-");
  if (url?.includes("api.deezer.com/album/")) return url.replace("size=big", "size=medium");
  return url?.replace("ab67616d00001e02", "ab67616d00004851").replace("ab67616d0000b273", "ab67616d00004851");
}

/** Rows rendered at first; more appear as the list scrolls. */
const PAGE = 20;

const bySearch = (a: Suggestion, b: Suggestion) => (b.score ?? 0) - (a.score ?? 0) || (b.pop ?? 0) - (a.pop ?? 0) || a.title.length - b.title.length;

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
  /** Most suggestions to list (the list scrolls). */
  limit?: number;
}

/** Text box with a suggestion list. Picking a suggestion (click or Enter) submits it. */
export function SuggestInput({ id, label, placeholder, local, remote, dedupeKey, disabled, onSubmit, onEmptySpace, shake, compact, limit = 8 }: SuggestProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remoteFor, setRemoteFor] = useState<{ q: string; items: Suggestion[] } | null>(null);
  const [place, setPlace] = useState({ up: false, max: 320 });
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
    if (!remote || q.trim().length < 2) return;
    const query = q.trim();
    const t = setTimeout(() => {
      remote(query)
        .then((items) => setRemoteFor({ q: query, items }))
        .catch(() => setRemoteFor({ q: query, items: [] }));
    }, 180);
    return () => clearTimeout(t);
  }, [q, remote]);

  const lastShown = useRef<Suggestion[]>([]);
  const suggestions = useMemo(() => {
    const query = q.trim();
    if (!query) return [];
    let items = localItems;
    if (remote) {
      // Wait for the wider search and rank everything together, so this game's songs don't show up first.
      if (query.length < 2) return [];
      if (remoteFor?.q !== query) return lastShown.current;
      items = [...localItems, ...remoteFor.items].sort(bySearch);
    }
    const seen = new Set<string>();
    const out: Suggestion[] = [];
    for (const s of items) {
      const k = dedupeKey ? dedupeKey(s) : `${normTitle(s.title)}|${normArtist((s.artist ?? "").split(",")[0])}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
      if (out.length >= limit) break;
    }
    return out;
  }, [q, localItems, remote, remoteFor, dedupeKey, limit]);
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [q]);
  const shown = suggestions.slice(0, visible);
  const listRef = useRef<HTMLUListElement>(null);
  const moreRef = useRef<HTMLLIElement>(null);
  const hasMore = suggestions.length > visible;
  useEffect(() => {
    const root = listRef.current;
    const end = moreRef.current;
    if (!root || !end || !hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setVisible((v) => v + PAGE), { root, rootMargin: "120px" });
    io.observe(end);
    return () => io.disconnect();
  }, [hasMore, visible, open]);
  useEffect(() => {
    lastShown.current = suggestions;
  }, [suggestions]);

  // Open the list toward whichever side of the box has room (the keyboard can take half the screen).
  const listOpen = open && suggestions.length > 0;
  const withCovers = suggestions.some((x) => x.image);
  useLayoutEffect(() => {
    if (!listOpen) return;
    const measure = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const area = visibleArea(el);
      const top = area.top;
      const bottom = area.top + area.height;
      const below = bottom - r.bottom - 12;
      const above = r.top - top - 12;
      const want = Math.min(320, Math.min(suggestions.length, 6) * 56 + 14);
      // on a touch screen the on-screen keyboard is up while the list is open: open upward
      const touch = window.matchMedia?.("(pointer: coarse)").matches;
      const up = (touch && above >= 112) || (below < want && above > below);
      setPlace({ up, max: Math.max(112, Math.min(320, up ? above : below)) });
    };
    measure();
    const vv = window.visualViewport;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
  }, [listOpen, suggestions.length]);

  // The best match is highlighted, so Enter takes it.
  useEffect(() => setActive(0), [q]);
  // Keep the highlighted row in view when moving with the arrow keys.
  useEffect(() => {
    if (active > 0) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);

  function submit(s?: Suggestion) {
    const value = s ?? { title: q.trim() };
    if (!value.title) return;
    onSubmit(value);
    setQ("");
    setOpen(false);
    setRemoteFor(null);
  }

  return (
    <div className={cx("relative", shaking && "animate-shake")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(listOpen && active >= 0 ? suggestions[active] : undefined);
        }}
        className="relative"
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
              setActive((a) => {
                const next = Math.min(suggestions.length - 1, a + 1);
                if (next >= visible) setVisible((v) => v + PAGE);
                return next;
              });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
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
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          className={cx(
            "w-full min-w-0 border-2 border-ink bg-field text-ink caret-red outline-none transition-shadow placeholder:text-ink-3 focus:shadow-[0_0_0_5px_rgb(31_80_176/0.18)] focus-visible:outline-none disabled:opacity-50",
            compact ? "h-14 rounded-xl px-4 text-[18px]" : "h-16 rounded-[14px] px-5 text-[21px] sm:h-20 sm:px-6 sm:text-[26px]",
          )}
        />
      </form>
      {listOpen && (
        <ul
          ref={listRef}
          id={`${id}-suggestions`}
          role="listbox"
          style={{ maxHeight: place.max }}
          className={cx(
            "absolute z-20 w-full overflow-y-auto overscroll-contain rounded-[14px] border-[1.5px] border-ink bg-paper p-1.5 shadow-[0_18px_40px_-18px_rgb(30_30_30/0.35)]",
            place.up ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {shown.map((s, i) => (
            <li key={s.key + i} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(s)}
                onMouseEnter={() => setActive(i)}
                className={cx("flex min-h-[56px] w-full items-center gap-3 rounded-[10px] px-3 py-1.5 text-left text-ink", i === active && "bg-card")}
              >
                {withCovers && (s.image ? <img src={thumb(s.image)} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-[4px] bg-paper-2 object-cover" /> : <span className="h-11 w-11 shrink-0 rounded-[4px] bg-paper-2" />)}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[16px] font-semibold">{s.title}</span>
                  {s.artist && <span className="truncate text-[14px] text-ink-2">{s.artist}</span>}
                </span>
              </button>
            </li>
          ))}
          {hasMore && <li ref={moreRef} aria-hidden className="h-6" />}
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

/** Matches listed for a song search (more if they're all one artist's). */
const MAX_MATCHES = 50;

/** 0 to 1: Spotify streams for the built-in songs, Deezer rank otherwise. */
function popularity(t: Track): number {
  if (t.streams) return Math.min(1, Math.log10(t.streams) / 4);
  return (t.rank ?? 0) / 1e6;
}

/** Song title guess. */
export function GuessInput({ pool, scope, disabled, onGuess, onEmptySpace, shake, hideArtist, compact, id = "guess" }: GuessProps) {
  const local = useMemo(
    () => (q: string) => {
      const out: (Suggestion & { lead: string })[] = [];
      for (const t of pool) {
        const score = searchRank(q, t.title, hideArtist ? [] : t.artists);
        if (score > 0) out.push({ key: t.key, title: cleanTitle(t.title), artist: hideArtist ? undefined : t.artists.join(", "), score, pop: popularity(t), image: t.image, lead: normArtist(t.artists[0] ?? "") });
      }
      out.sort(bySearch);
      // Typing an artist: list every song of theirs in the game, not just the first 50.
      const lead = out[0]?.lead;
      const top = out.slice(0, MAX_MATCHES);
      if (lead && top.filter((x) => x.lead === lead).length >= top.length * 0.8) {
        const theirs = out.filter((x) => x.lead === lead);
        return [...theirs, ...out.filter((x) => x.lead !== lead)].slice(0, Math.max(MAX_MATCHES, theirs.length));
      }
      return top;
    },
    [pool, scope, hideArtist],
  );
  const remote = useMemo(
    () =>
      scope === "any"
        ? async (q: string) =>
            (await dzSearchTracks(q, 10)).map((t) => ({
              key: `dz:${t.id}`,
              title: cleanTitle(t.title),
              artist: hideArtist ? undefined : t.artist.name,
              score: searchRank(q, t.title, hideArtist ? [] : [t.artist.name]),
              pop: (t.rank ?? 0) / 1e6,
              image: t.album?.cover_medium,
            }))
        : undefined,
    [scope, hideArtist],
  );
  return (
    <SuggestInput
      id={id}
      limit={Infinity}
      label="Song title"
      placeholder={compact ? "Song title" : "Guess the song"}
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
        .map((n) => ({ n, s: searchRank(q, n, []) }))
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
        .map(([a, artist]) => ({ a, artist, s: searchRank(q, a, []) }))
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
