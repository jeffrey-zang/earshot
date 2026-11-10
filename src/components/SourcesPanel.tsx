"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SourceSpec, TimeRange } from "@/lib/types";
import { needsSpotifyLogin, sourceKey } from "@/lib/sources";
import { beginLogin, getClientId, isConnected } from "@/lib/spotify/auth";
import { getMyPlaylists, playlistCount, playlistImage, sp, type SpPlaylist } from "@/lib/spotify/api";
import { dz, dzSearchArtists, type DzArtist } from "@/lib/deezer";
import { fetchEmbed, parseMusicLink } from "@/lib/embed";
import { Button, Spinner, cx } from "./ui";
import { Glyph } from "./notation";
import { ClientIdSettings, SpotifyLogo, useSpotifyUser } from "./SpotifyConnect";
import { pillField, popoverPanel, usePopover } from "./SettingsPanels";

/* ------------------------------------------------------------------ account */

export interface SpotifyAccount {
  /** connected: signed in. connect: a client ID exists, so the user can sign in. none: Spotify isn't set up here. */
  status: "connected" | "connect" | "none";
  ready: boolean;
  name?: string;
  error?: string;
  playlists: SpPlaylist[] | null;
  playlistError: string | null;
  counts: { liked?: number; albums?: number; artists?: number };
  /** Re-read the token and client ID (after the user saves their own Spotify app). */
  refresh: () => void;
}

/** The user's Spotify state, playlists and library counts. */
export function useSpotifyAccount(enabled = true): SpotifyAccount {
  const user = useSpotifyUser(enabled);
  const [hasToken, setHasToken] = useState(false);
  const [hasClientId, setHasClientId] = useState(false);
  const [playlists, setPlaylists] = useState<SpPlaylist[] | null>(null);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [counts, setCounts] = useState<SpotifyAccount["counts"]>({});

  const refresh = useCallback(() => {
    setHasToken(isConnected());
    setHasClientId(!!getClientId());
  }, []);
  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  const live = enabled && user.ready && user.connected && !user.error;
  useEffect(() => {
    if (!live) return;
    let on = true;
    getMyPlaylists()
      .then((p) => on && setPlaylists(p))
      .catch((e: Error) => on && setPlaylistError(e.message));
    const total = <T,>(path: string, pick: (r: T) => number | undefined, key: keyof SpotifyAccount["counts"]) =>
      sp<T>(path)
        .then((r) => on && setCounts((c) => ({ ...c, [key]: pick(r) })))
        .catch(() => {});
    total<{ total?: number }>("/me/tracks?limit=1", (r) => r.total, "liked");
    total<{ total?: number }>("/me/albums?limit=1", (r) => r.total, "albums");
    total<{ artists?: { total?: number } }>("/me/following?type=artist&limit=1", (r) => r.artists?.total, "artists");
    return () => {
      on = false;
    };
  }, [live]);

  const connected = user.ready ? user.connected : hasToken;
  return {
    status: connected ? "connected" : hasClientId ? "connect" : "none",
    ready: user.ready,
    name: user.name,
    error: user.error,
    playlists,
    playlistError,
    counts,
    refresh,
  };
}

/* ------------------------------------------------------------------ art */

const ART_KEY = "earshot.sourceArt.v1";

/** Cover art for sources added from links and searches, remembered in this browser. */
function useArtCache() {
  const [art, setArt] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      setArt(JSON.parse(localStorage.getItem(ART_KEY) || "{}"));
    } catch {
      /* storage unavailable */
    }
  }, []);
  const remember = useCallback((s: SourceSpec, url?: string | null) => {
    if (!url) return;
    setArt((a) => {
      const next = Object.fromEntries([...Object.entries(a).filter(([k]) => k !== sourceKey(s)), [sourceKey(s), url]].slice(-60));
      try {
        localStorage.setItem(ART_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);
  return [art, remember] as const;
}

const ICONS = {
  trend: (
    <>
      <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
      <path d="M16 7h6v6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </>
  ),
  star: <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
};

function IconArt({ icon, bare }: { icon: keyof typeof ICONS; bare?: boolean }) {
  return (
    <span className={cx("grid h-full w-full place-items-center text-ink", !bare && "bg-card")}>
      <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ICONS[icon]}
      </svg>
    </span>
  );
}

function ImageArt({ src, round }: { src: string; round?: boolean }) {
  return (
    <span className="block h-full w-full bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" className={cx("h-full w-full object-cover", round && "rounded-full p-3")} />
    </span>
  );
}

/** Spotify's own Liked Songs tile. */
function LikedArt() {
  return (
    <span className="grid h-full w-full place-items-center" style={{ background: "linear-gradient(135deg,#450AF5,#8E8EE5 55%,#C4EFD9)" }}>
      <svg viewBox="0 0 24 24" className="h-14 w-14 text-white" fill="currentColor" aria-hidden>
        <path d="M12 21.2 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5L12 21.2Z" />
      </svg>
    </span>
  );
}

/** The hits catalog: a pair of beamed eighth notes. */
function NotesArt() {
  return (
    <span className="grid h-full w-full place-items-center bg-card">
      <svg viewBox="-14 -46 58 58" className="h-12 w-12" aria-hidden>
        <Glyph type="pair" x={0} y={0} />
      </svg>
    </span>
  );
}

function SpotifyArt() {
  return (
    <span className="grid h-full w-full place-items-center bg-card">
      <SpotifyLogo className="h-12 w-12 text-[#1DB954]" />
    </span>
  );
}

const RANGE_LABEL: Record<TimeRange, string> = { short_term: "Last 4 weeks", medium_term: "Last 6 months", long_term: "All time" };
const RANGES = Object.keys(RANGE_LABEL) as TimeRange[];

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Name, fact line and art for any source, for tiles of sources added elsewhere (presets, links, saved configs). */
function describeTile(s: SourceSpec, art: Record<string, string>, connected: boolean): { label: string; fact: string; art: ReactNode } {
  const img = art[sourceKey(s)];
  const locked = !connected && needsSpotifyLogin(s) ? "Needs Spotify" : null;
  switch (s.kind) {
    case "catalog":
      return { label: "Hits catalog", fact: "2,000+ hits", art: <NotesArt /> };
    case "deezer-chart":
      return { label: "Global top 100", fact: "Charting now", art: <IconArt icon="globe" /> };
    case "deezer-artist":
      return { label: s.name, fact: "Artist", art: img ? <ImageArt src={img} round /> : <IconArt icon="mic" /> };
    case "deezer-playlist":
      return { label: s.name, fact: "Deezer playlist", art: img ? <ImageArt src={img} /> : <IconArt icon="music" /> };
    case "deezer-album":
      return { label: s.name, fact: "Deezer album", art: img ? <ImageArt src={img} /> : <IconArt icon="disc" /> };
    case "spotify-link":
      return {
        label: s.name || `Spotify ${s.type}`,
        fact: `Spotify ${s.type}`,
        art: img ? <ImageArt src={img} round={s.type === "artist"} /> : <IconArt icon={s.type === "artist" ? "mic" : s.type === "album" ? "disc" : "music"} />,
      };
    case "spotify-liked":
      return { label: "Liked Songs", fact: locked ?? "Your likes", art: <LikedArt /> };
    case "spotify-top":
      return { label: "Top tracks", fact: locked ?? RANGE_LABEL[s.range], art: <IconArt icon="trend" /> };
    case "spotify-recent":
      return { label: "Recently played", fact: locked ?? "Last 50 plays", art: <IconArt icon="clock" /> };
    case "spotify-playlist":
      return { label: s.name, fact: locked ?? "Playlist", art: img ? <ImageArt src={img} /> : <IconArt icon="music" /> };
    case "spotify-saved-albums":
      return { label: "Saved albums", fact: locked ?? "Your albums", art: <IconArt icon="disc" /> };
    case "spotify-followed-artists":
      return { label: "Followed artists", fact: locked ?? "Their popular songs", art: <IconArt icon="user" /> };
    case "spotify-top-artists":
      return { label: "Top artists", fact: locked ?? RANGE_LABEL[s.range], art: <IconArt icon="star" /> };
  }
}

/* ------------------------------------------------------------------ panel */

interface Props {
  sources: SourceSpec[];
  onChange: (s: SourceSpec[]) => void;
  /** Pass it when the page shows the account too (header, playlist search); otherwise the panel loads its own. */
  account?: SpotifyAccount;
  /** Shows only playlists whose name contains this. */
  filter?: string;
}

interface TileDef {
  id: string;
  label: string;
  fact?: ReactNode;
  art: ReactNode;
  /** The source this tile toggles. */
  spec?: SourceSpec;
  onClick?: () => void;
  dashed?: boolean;
  /** "link" or "artists": the tile opens a popover. */
  popover?: "link" | "artists";
  /** A time range picker in place of the fact line. */
  range?: { value: TimeRange; set: (r: TimeRange) => void; label: string };
}

/** Song sources as a grid of square tiles: tap to add or remove, arrow keys to move between them. */
export function SourcesPanel({ sources, onChange, account: given, filter = "" }: Props) {
  const own = useSpotifyAccount(!given);
  const account = given ?? own;
  const connected = account.status === "connected";
  const [art, remember] = useArtCache();
  const [announce, setAnnounce] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const keys = useMemo(() => new Set(sources.map(sourceKey)), [sources]);
  const has = (s: SourceSpec) => keys.has(sourceKey(s));
  const toggle = (s: SourceSpec, on?: boolean) => {
    const present = has(s);
    const want = on ?? !present;
    if (want && !present) onChange([...sources, s]);
    if (!want && present) onChange(sources.filter((x) => sourceKey(x) !== sourceKey(s)));
  };
  const add = (s: SourceSpec, image?: string | null) => {
    remember(s, image);
    toggle(s, true);
    setAnnounce(`Added ${describeTile(s, art, connected).label}`);
  };

  // Time ranges for the top tracks / top artists tiles: the selected source's range, else the last picked.
  const [topPref, setTopPref] = useState<TimeRange>("medium_term");
  const [artistPref, setArtistPref] = useState<TimeRange>("medium_term");
  const firstOf = (kind: "spotify-top" | "spotify-top-artists") => sources.find((s) => s.kind === kind) as Extract<SourceSpec, { range: TimeRange }> | undefined;
  const top = firstOf("spotify-top");
  const topArtists = firstOf("spotify-top-artists");
  const rangeOf = (kind: "spotify-top" | "spotify-top-artists", current: SourceSpec | undefined, value: TimeRange, setPref: (r: TimeRange) => void, label: string) => ({
    value,
    label,
    set: (r: TimeRange) => {
      setPref(r);
      if (!current) return;
      const next = { kind, range: r } as SourceSpec;
      onChange(has(next) ? sources.filter((x) => x !== current) : sources.map((x) => (x === current ? next : x)));
    },
  });
  const topRange = top?.range ?? topPref;
  const artistRange = topArtists?.range ?? artistPref;

  const connect = () => beginLogin({ returnTo: window.location.pathname }).catch((e: Error) => setLoginError(e.message));

  const linkTile: TileDef = { id: "link", label: "Paste a link", fact: "Spotify or Deezer", art: <IconArt icon="link" bare />, dashed: true, popover: "link" };
  const catalogTile: TileDef = { id: "catalog", spec: { kind: "catalog" }, ...describeTile({ kind: "catalog" }, art, connected) };
  const chartTile: TileDef = { id: "chart", spec: { kind: "deezer-chart" }, ...describeTile({ kind: "deezer-chart" }, art, connected) };
  const artistsTile: TileDef = { id: "artists", label: "Artists", fact: "Any artist", art: <IconArt icon="mic" />, popover: "artists" };

  let fixed: TileDef[];
  if (connected) {
    const c = account.counts;
    const spec = (s: SourceSpec, id: string, fact?: string): TileDef => {
      const d = describeTile(s, art, true);
      return { id, spec: s, ...d, fact: fact ?? d.fact };
    };
    fixed = [
      spec({ kind: "spotify-liked" }, "liked", c.liked != null ? plural(c.liked, "song") : ""),
      { ...spec({ kind: "spotify-top", range: topRange }, "top"), range: rangeOf("spotify-top", top, topRange, setTopPref, "Top tracks from") },
      spec({ kind: "spotify-recent" }, "recent"),
      spec({ kind: "spotify-saved-albums" }, "albums", c.albums != null ? plural(c.albums, "album") : ""),
      spec({ kind: "spotify-followed-artists" }, "followed", c.artists != null ? plural(c.artists, "artist") : ""),
      { ...spec({ kind: "spotify-top-artists", range: artistRange }, "top-artists"), range: rangeOf("spotify-top-artists", topArtists, artistRange, setArtistPref, "Top artists from") },
      linkTile,
    ];
  } else {
    fixed = [
      ...(account.status === "connect" ? [{ id: "connect", label: "Connect Spotify", fact: "Your library", art: <SpotifyArt />, onClick: connect }] : []),
      linkTile,
      catalogTile,
      chartTile,
      artistsTile,
    ];
  }

  const playlistTiles: TileDef[] = connected
    ? (account.playlists ?? []).map((p) => {
        const count = playlistCount(p);
        const img = playlistImage(p);
        return { id: `pl:${p.id}`, spec: { kind: "spotify-playlist", id: p.id, name: p.name }, label: p.name, fact: count != null ? plural(count, "song") : "", art: img ? <ImageArt src={img} /> : <IconArt icon="music" /> };
      })
    : [];

  // Anything selected that has no tile above (links, artists, presets, a saved config) gets its own tile.
  const covered = new Set([...fixed, ...playlistTiles].flatMap((t) => (t.spec ? [sourceKey(t.spec)] : [])));
  const extras: TileDef[] = sources.filter((s) => !covered.has(sourceKey(s))).map((s) => ({ id: sourceKey(s), spec: s, ...describeTile(s, art, connected) }));

  const q = filter.trim().toLowerCase();
  const tiles = [...fixed, ...extras, ...playlistTiles.filter((t) => !q || t.label.toLowerCase().includes(q))];

  // Roving tabindex: the grid is one Tab stop; arrow keys move between tiles.
  const gridRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const tabId = tiles.some((t) => t.id === activeId) ? activeId : tiles[0]?.id;

  const onGridKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (!el.dataset.tile || e.metaKey || e.ctrlKey || e.altKey) return;
    const all = [...(gridRef.current?.querySelectorAll<HTMLElement>("[data-tile]") ?? [])];
    const i = all.indexOf(el);
    const top0 = all[0]?.getBoundingClientRect().top ?? 0;
    const firstWrap = all.findIndex((t) => Math.abs(t.getBoundingClientRect().top - top0) > 4);
    const cols = firstWrap < 0 ? all.length : firstWrap;
    const last = all.length - 1;
    let j: number;
    switch (e.key) {
      case "ArrowRight":
        j = i + 1;
        break;
      case "ArrowLeft":
        j = i - 1;
        break;
      case "ArrowDown":
        j = i + cols > last && Math.floor(i / cols) < Math.floor(last / cols) ? last : i + cols;
        break;
      case "ArrowUp":
        j = i - cols;
        break;
      case "Home":
        j = 0;
        break;
      case "End":
        j = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    if (j >= 0 && j <= last) all[j].focus();
  };

  return (
    <div>
      <div
        ref={gridRef}
        role="group"
        aria-label="Songs"
        onKeyDown={onGridKey}
        onFocus={(e) => {
          const id = (e.target as HTMLElement).dataset.tile;
          if (id) setActiveId(id);
        }}
        className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-x-[22px] gap-y-6"
      >
        {tiles.map((t) => (
          <Tile key={t.id} tile={t} selected={t.spec ? has(t.spec) : false} tabbable={t.id === tabId} onToggle={() => t.spec && toggle(t.spec)} has={has} toggle={toggle} add={add} />
        ))}
      </div>

      {connected && !account.error && !account.playlists && !account.playlistError && <Spinner className="mt-6 text-ink-3" />}
      {connected && q && account.playlists && !tiles.some((t) => t.id.startsWith("pl:")) && <p className="mt-6 text-[17px] text-ink-3">No playlists match.</p>}
      {account.playlistError && <p className="mt-4 text-[15px] text-error">{account.playlistError}</p>}
      {loginError && <p className="mt-4 text-[15px] text-error">{loginError}</p>}
      {!connected && (
        <div className="mt-4">
          <ClientIdSettings onSaved={account.refresh} />
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ tiles */

function Tile({
  tile,
  selected,
  tabbable,
  onToggle,
  has,
  toggle,
  add,
}: {
  tile: TileDef;
  selected: boolean;
  tabbable: boolean;
  onToggle: () => void;
  has: (s: SourceSpec) => boolean;
  toggle: (s: SourceSpec, on?: boolean) => void;
  add: (s: SourceSpec, image?: string | null) => void;
}) {
  const pop = usePopover();
  const isPopover = !!tile.popover;
  const tileProps = isPopover ? pop.triggerProps : { onClick: tile.spec ? onToggle : tile.onClick, "aria-pressed": tile.spec ? selected : undefined };

  return (
    <div className="relative min-w-0" {...(isPopover ? pop.wrapProps : {})}>
      <button
        type="button"
        data-tile={tile.id}
        tabIndex={tabbable ? 0 : -1}
        {...tileProps}
        className="group block w-full text-left focus-visible:outline-none"
      >
        <span
          className={cx(
            "relative block aspect-square w-full rounded-[6px] transition-[filter,transform] duration-150 group-hover:brightness-[0.97] group-active:scale-[0.98] group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-ink",
            tile.dashed ? "border-2 border-dashed border-rule-strong" : "overflow-hidden",
          )}
        >
          <span className={cx("block h-full w-full overflow-hidden", tile.dashed ? "rounded-[4px]" : "rounded-[6px]")}>{tile.art}</span>
          {selected && <span className="pointer-events-none absolute inset-0 rounded-[6px] border-[3px] border-blue" aria-hidden />}
        </span>
        <span className="mt-3 block truncate text-[17px] font-semibold leading-snug text-ink">{tile.label}</span>
        {!tile.range && <span className="block min-h-[22px] truncate text-[15px] leading-snug text-ink-3">{tile.fact}</span>}
      </button>
      {selected && (
        <span className="animate-pop pointer-events-none absolute -right-2 -top-2 grid h-[30px] w-[30px] place-items-center rounded-full bg-blue text-white ring-2 ring-paper" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      )}
      {tile.range && <RangeSelect range={tile.range} tabbable={tabbable} />}

      {isPopover && pop.open && (
        <div {...pop.panelProps} aria-label={tile.label} className={cx(popoverPanel, tile.popover === "link" ? "w-[440px]" : "w-[380px]")}>
          {tile.popover === "link" ? (
            <LinkForm
              add={(s, image) => {
                add(s, image);
                pop.close(true);
              }}
            />
          ) : (
            <ArtistSearch has={has} toggle={toggle} add={add} />
          )}
        </div>
      )}
    </div>
  );
}

/** The fact line of the top tracks / artists tiles, as a plain-looking select. */
function RangeSelect({ range, tabbable }: { range: NonNullable<TileDef["range"]>; tabbable: boolean }) {
  return (
    <span className="relative inline-flex max-w-full items-center">
      <select
        aria-label={range.label}
        tabIndex={tabbable ? 0 : -1}
        value={range.value}
        onChange={(e) => range.set(e.target.value as TimeRange)}
        className="min-h-[22px] max-w-full cursor-pointer appearance-none truncate rounded-md bg-transparent pr-5 text-[15px] leading-snug text-ink-3 hover:text-ink"
      >
        {RANGES.map((r) => (
          <option key={r} value={r}>
            {RANGE_LABEL[r]}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

/** Resolves a Spotify or Deezer playlist, album or artist link into a source. */
function LinkForm({ add }: { add: (s: SourceSpec, image?: string | null) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const link = parseMusicLink(value);
    if (!link) return setErr("That isn't a Spotify or Deezer playlist, album or artist link.");
    if (link.type === "track") return setErr("Paste a playlist, album or artist, not a single song.");
    setBusy(true);
    setErr(null);
    try {
      if (link.service === "spotify") {
        const e = await fetchEmbed(link.type, link.id);
        add({ kind: "spotify-link", type: link.type, id: link.id, name: e.name }, e.image);
      } else {
        const info = await dz<{ title?: string; name?: string; picture_medium?: string; cover_medium?: string }>(`${link.type}/${link.id}`);
        const name = info.title ?? info.name ?? `Deezer ${link.type}`;
        const image = info.picture_medium ?? info.cover_medium;
        if (link.type === "playlist") add({ kind: "deezer-playlist", id: link.id, name }, image);
        else if (link.type === "album") add({ kind: "deezer-album", id: link.id, name }, image);
        else add({ kind: "deezer-artist", id: link.id, name }, image);
      }
      setValue("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex gap-2">
        <input
          className={cx(pillField, "bg-paper")}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setErr(null);
          }}
          placeholder="open.spotify.com/playlist/…"
          aria-label="Playlist, album or artist link"
          inputMode="url"
          autoComplete="off"
        />
        <Button type="submit" className="min-h-12 shrink-0 px-5" disabled={busy || !value.trim()}>
          {busy ? <Spinner /> : "Add"}
        </Button>
      </div>
      {err && (
        <p role="alert" className="mt-2 text-[15px] text-error">
          {err}
        </p>
      )}
    </form>
  );
}

/** Search Deezer for artists; each result adds or removes that artist. */
function ArtistSearch({ has, toggle, add }: { has: (s: SourceSpec) => boolean; toggle: (s: SourceSpec, on?: boolean) => void; add: (s: SourceSpec, image?: string | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DzArtist[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const id = setTimeout(() => {
      setBusy(true);
      dzSearchArtists(q.trim(), 8)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div>
      <div className="relative">
        <input type="search" className={cx(pillField, "bg-paper pr-12")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artists" aria-label="Search artists" autoComplete="off" />
        {busy && <Spinner className="absolute right-5 top-4 text-ink-3" />}
      </div>
      {results.length > 0 && (
        <ul className="-mx-2 mt-3 max-h-80 overflow-y-auto">
          {results.map((a) => {
            const spec: SourceSpec = { kind: "deezer-artist", id: a.id, name: a.name };
            const on = has(spec);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => (on ? toggle(spec, false) : add(spec, a.picture_medium))}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-paper"
                >
                  {a.picture_medium ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.picture_medium} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="h-10 w-10 shrink-0 rounded-full bg-paper-2" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{a.name}</span>
                  <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full", on ? "bg-blue text-white" : "border-[1.5px] border-rule-strong text-transparent")} aria-hidden>
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
