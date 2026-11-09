"use client";

import { useEffect, useMemo, useState } from "react";
import type { SourceSpec, TimeRange } from "@/lib/types";
import { describeSource, sourceKey } from "@/lib/sources";
import { getClientId } from "@/lib/spotify/auth";
import { getMyPlaylists, playlistCount, playlistImage, type SpPlaylist } from "@/lib/spotify/api";
import { dz, dzSearchArtists, type DzArtist } from "@/lib/deezer";
import { fetchEmbed, parseMusicLink } from "@/lib/embed";
import { Button, Chip, ChoiceLine, Segmented, Spinner, TextField, Toggle, cx } from "./ui";
import { ClientIdSettings, ConnectButton, SpotifyLogo, useSpotifyUser } from "./SpotifyConnect";

type Tab = "catalog" | "spotify" | "link" | "artists";

interface Props {
  sources: SourceSpec[];
  onChange: (s: SourceSpec[]) => void;
}

const TABS: [Tab, string][] = [
  ["catalog", "Catalog"],
  ["spotify", "My Spotify"],
  ["link", "Paste a link"],
  ["artists", "Artists"],
];

export function SourcesPanel({ sources, onChange }: Props) {
  const [tab, setTab] = useState<Tab>("catalog");
  const keys = useMemo(() => new Set(sources.map(sourceKey)), [sources]);
  const has = (s: SourceSpec) => keys.has(sourceKey(s));
  const toggle = (s: SourceSpec, on?: boolean) => {
    const present = has(s);
    const want = on ?? !present;
    if (want && !present) onChange([...sources, s]);
    if (!want && present) onChange(sources.filter((x) => sourceKey(x) !== sourceKey(s)));
  };
  const add = (s: SourceSpec) => toggle(s, true);

  return (
    <div>
      <ChoiceLine className="mb-2 border-b border-rule" >
        {TABS.map(([t, label]) => (
          <Chip key={t} selected={tab === t} onClick={() => setTab(t)} role="tab" aria-selected={tab === t}>
            {label}
          </Chip>
        ))}
      </ChoiceLine>

      <div role="tabpanel">
        {tab === "catalog" && (
          <div className="divide-y divide-rule">
            <Toggle checked={has({ kind: "catalog" })} onChange={(v) => toggle({ kind: "catalog" }, v)} label="Hits catalog" hint="About 2,000 well-known songs, 1950s to today, tagged with year and genre." />
            <Toggle checked={has({ kind: "deezer-chart" })} onChange={(v) => toggle({ kind: "deezer-chart" }, v)} label="Global top 100" hint="Whatever is charting right now." />
          </div>
        )}
        {tab === "spotify" && <SpotifyTab has={has} toggle={toggle} />}
        {tab === "link" && <LinkTab add={add} />}
        {tab === "artists" && <ArtistTab has={has} add={add} />}
      </div>

      <div className="mt-8 border-t-2 border-ink pt-4">
        <div className="text-sm text-ink-2">In this game</div>
        {sources.length === 0 ? (
          <p className="mt-2 text-ink-2">Nothing selected yet. Pick at least one source above.</p>
        ) : (
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {sources.map((s) => (
              <li key={sourceKey(s)} className="inline-flex h-9 items-center gap-2 bg-ink pl-3 pr-1 text-sm font-semibold text-paper">
                {s.kind.startsWith("spotify") && <SpotifyLogo className="h-3.5 w-3.5" />}
                {describeSource(s)}
                <button type="button" aria-label={`Remove ${describeSource(s)}`} className="grid h-7 w-7 place-items-center text-paper/70 hover:text-paper" onClick={() => toggle(s, false)}>
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <path d="M2 2l8 8M10 2l-8 8" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span className={cx("grid h-5 w-5 shrink-0 place-items-center border-[1.5px] border-ink", on ? "bg-ink text-paper" : "bg-field")} aria-hidden>
      {on && (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M5 10.5l3.2 3L15 6.5" />
        </svg>
      )}
    </span>
  );
}

function SpotifyTab({ has, toggle }: { has: (s: SourceSpec) => boolean; toggle: (s: SourceSpec, on?: boolean) => void }) {
  const user = useSpotifyUser();
  const [topRange, setTopRange] = useState<TimeRange>("medium_term");
  const [playlists, setPlaylists] = useState<SpPlaylist[] | null>(null);
  const [plError, setPlError] = useState<string | null>(null);
  const [plFilter, setPlFilter] = useState("");

  useEffect(() => {
    if (!user.connected || user.error) return;
    getMyPlaylists().then(setPlaylists).catch((e: Error) => setPlError(e.message));
  }, [user.connected, user.error]);

  if (!user.ready) return <Spinner className="mt-4 text-ink-2" />;

  if (!getClientId()) {
    return (
      <div className="pt-3 text-ink-2">
        <p>Spotify login isn&apos;t set up on this site yet. You can still paste public Spotify playlist, album or artist links under Paste a link.</p>
        <ClientIdSettings />
      </div>
    );
  }

  if (!user.connected) {
    return (
      <div className="space-y-4 pt-3 text-ink-2">
        <p>Connect to play with your Liked Songs, playlists, saved albums, top tracks and followed artists.</p>
        <ConnectButton />
        <p className="text-sm">
          While this app is in Spotify&apos;s development mode, only accounts on its user list can sign in. If yours isn&apos;t, paste a link to any public playlist, album or artist instead.
        </p>
        <ClientIdSettings />
      </div>
    );
  }

  const filtered = (playlists ?? []).filter((p) => p.name.toLowerCase().includes(plFilter.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-3 text-sm">
        <span className="inline-flex items-center gap-2 text-ink-2">
          <SpotifyLogo className="h-4 w-4 text-ink" /> Connected as <span className="font-semibold text-ink">{user.name}</span>
        </span>
        <Button
          variant="text"
          className="min-h-0 text-sm"
          onClick={() => {
            import("@/lib/spotify/auth").then((m) => {
              m.logout();
              window.location.reload();
            });
          }}
        >
          Disconnect
        </Button>
      </div>
      {user.error && <p className="mb-3 border-l-0 bg-paper-2 p-3 text-sm text-error">{user.error}</p>}
      <div className="divide-y divide-rule border-t border-rule">
        <Toggle checked={has({ kind: "spotify-liked" })} onChange={(v) => toggle({ kind: "spotify-liked" }, v)} label="Liked Songs" />
        <Toggle checked={has({ kind: "spotify-saved-albums" })} onChange={(v) => toggle({ kind: "spotify-saved-albums" }, v)} label="Saved albums" hint="Every track on every album in your library." />
        <Toggle checked={has({ kind: "spotify-followed-artists" })} onChange={(v) => toggle({ kind: "spotify-followed-artists" }, v)} label="Followed artists" hint="Popular songs from each artist you follow." />
        <Toggle checked={has({ kind: "spotify-recent" })} onChange={(v) => toggle({ kind: "spotify-recent" }, v)} label="Recently played" hint="Your last 50 plays." />
        <div className="py-3">
          <div className="font-semibold">Your top tracks and artists</div>
          <Segmented<TimeRange>
            value={topRange}
            onChange={setTopRange}
            options={[
              { value: "short_term", label: "Last 4 weeks" },
              { value: "medium_term", label: "6 months" },
              { value: "long_term", label: "All time" },
            ]}
          />
          <div className="mt-1 flex flex-wrap gap-2">
            <TopButton on={has({ kind: "spotify-top", range: topRange })} onClick={() => toggle({ kind: "spotify-top", range: topRange })}>
              Top tracks
            </TopButton>
            <TopButton on={has({ kind: "spotify-top-artists", range: topRange })} onClick={() => toggle({ kind: "spotify-top-artists", range: topRange })}>
              Top artists
            </TopButton>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="font-semibold">Playlists</span>
          {playlists && playlists.length > 8 && <TextField className="h-10 max-w-48" placeholder="Filter" aria-label="Filter playlists" value={plFilter} onChange={(e) => setPlFilter(e.target.value)} />}
        </div>
        {plError && <p className="text-sm text-error">{plError}</p>}
        {!playlists && !plError && <Spinner className="text-ink-2" />}
        {playlists && playlists.length === 0 && <p className="text-ink-2">No playlists in your library.</p>}
        <ul className="grid max-h-96 grid-cols-1 overflow-y-auto border-t border-rule sm:grid-cols-2 sm:gap-x-6">
          {filtered.map((p) => {
            const spec: SourceSpec = { kind: "spotify-playlist", id: p.id, name: p.name };
            const on = has(spec);
            const img = playlistImage(p);
            const count = playlistCount(p);
            return (
              <li key={p.id} className="border-b border-rule">
                <button type="button" aria-pressed={on} onClick={() => toggle(spec)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-paper-2">
                  {img ? <img src={img} alt="" className="h-11 w-11 shrink-0 object-cover" /> : <span className="h-11 w-11 shrink-0 bg-paper-2" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-sm text-ink-2 tabular">
                      {count != null ? `${count} songs` : ""}
                      {p.owner?.display_name ? ` · ${p.owner.display_name}` : ""}
                    </span>
                  </span>
                  <Check on={on} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function TopButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cx("inline-flex h-10 items-center gap-2.5 border px-3 text-[15px] font-semibold", on ? "border-ink bg-ink text-paper" : "border-rule-strong hover:border-ink")}>
      {children}
    </button>
  );
}

function LinkTab({ add }: { add: (s: SourceSpec) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    const link = parseMusicLink(value);
    if (!link) return setMsg({ ok: false, text: "That doesn't look like a Spotify or Deezer playlist, album or artist link." });
    if (link.type === "track") return setMsg({ ok: false, text: "Paste a playlist, album or artist link. A single song isn't much of a game." });
    setBusy(true);
    setMsg(null);
    try {
      if (link.service === "spotify") {
        const e = await fetchEmbed(link.type, link.id);
        add({ kind: "spotify-link", type: link.type, id: link.id, name: e.name });
        setMsg({ ok: true, text: `Added ${e.name} (${link.type === "artist" ? "popular songs" : `${e.tracks.length} songs`}).` });
      } else {
        const info = await dz<{ title?: string; name?: string }>(`${link.type}/${link.id}`);
        const name = info.title ?? info.name ?? `Deezer ${link.type}`;
        if (link.type === "playlist") add({ kind: "deezer-playlist", id: link.id, name });
        else if (link.type === "album") add({ kind: "deezer-album", id: link.id, name });
        else add({ kind: "deezer-artist", id: link.id, name });
        setMsg({ ok: true, text: `Added ${name}.` });
      }
      setValue("");
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-3">
      <p className="mb-3 text-ink-2">Any public Spotify or Deezer playlist, album or artist. No login needed, so this also works for friends and for playlists you don&apos;t own.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField value={value} onChange={(e) => setValue(e.target.value)} placeholder="open.spotify.com/playlist/…" aria-label="Playlist, album or artist link" />
        <Button type="submit" variant="primary" className="h-12" disabled={busy || !value.trim()}>
          {busy ? <Spinner /> : "Add"}
        </Button>
      </form>
      {msg && <p className={cx("mt-2 text-sm", msg.ok ? "text-ink" : "text-error")}>{msg.text}</p>}
      <p className="mt-3 text-sm text-ink-2">Links read without a login include up to 100 songs per playlist and an artist&apos;s top songs.</p>
      <p className="mt-2 text-sm text-ink-2">
        <span className="font-semibold text-ink">Tip:</span> Spotify&apos;s own mixes of what you play most work too. In the Spotify app, open <span className="font-semibold text-ink">On Repeat</span>,{" "}
        <span className="font-semibold text-ink">Repeat Rewind</span>, a <span className="font-semibold text-ink">Daily Mix</span> or <span className="font-semibold text-ink">Your Top Songs</span>, tap Share, Copy link, and paste it here.
      </p>
    </div>
  );
}

function ArtistTab({ has, add }: { has: (s: SourceSpec) => boolean; add: (s: SourceSpec) => void }) {
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
    <div className="pt-3">
      <p className="mb-3 text-ink-2">Add any artist to play their most popular songs.</p>
      <div className="relative">
        <TextField type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artists" aria-label="Search artists" />
        {busy && <Spinner className="absolute right-4 top-4 text-ink-2" />}
      </div>
      {results.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 border-t border-rule sm:grid-cols-2 sm:gap-x-6">
          {results.map((a) => {
            const spec: SourceSpec = { kind: "deezer-artist", id: a.id, name: a.name };
            const on = has(spec);
            return (
              <li key={a.id} className="border-b border-rule">
                <button type="button" disabled={on} onClick={() => add(spec)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-paper-2 disabled:hover:bg-transparent">
                  {a.picture_medium ? <img src={a.picture_medium} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <span className="h-11 w-11 shrink-0 rounded-full bg-paper-2" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{a.name}</span>
                    <span className="block text-sm text-ink-2 tabular">{a.nb_fan ? `${a.nb_fan.toLocaleString()} fans` : ""}</span>
                  </span>
                  {on ? <span className="text-sm font-semibold">Added</span> : <span className="text-xl" aria-hidden>+</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
