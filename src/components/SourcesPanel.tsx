"use client";

import { useEffect, useMemo, useState } from "react";
import type { SourceSpec, TimeRange } from "@/lib/types";
import { describeSource, sourceKey } from "@/lib/sources";
import { getClientId } from "@/lib/spotify/auth";
import { getMyPlaylists, playlistCount, playlistImage, type SpPlaylist } from "@/lib/spotify/api";
import { dz, dzSearchArtists, type DzArtist } from "@/lib/deezer";
import { fetchEmbed, parseMusicLink } from "@/lib/embed";
import { Button, Chip, Segmented, Spinner, TextField, Toggle, cx } from "./ui";
import { ClientIdSettings, ConnectButton, SpotifyLogo, useSpotifyUser } from "./SpotifyConnect";

type Tab = "catalog" | "spotify" | "link" | "artists";

interface Props {
  sources: SourceSpec[];
  onChange: (s: SourceSpec[]) => void;
}

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
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["catalog", "Catalog"],
            ["spotify", "My Spotify"],
            ["link", "Paste a link"],
            ["artists", "Artists"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx("rounded-lg px-3 py-1.5 text-sm font-medium transition", tab === t ? "bg-fg text-ink" : "text-dim hover:bg-panel2 hover:text-fg")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "catalog" && (
        <div className="space-y-1">
          <Toggle checked={has({ kind: "catalog" })} onChange={(v) => toggle({ kind: "catalog" }, v)} label="Hits catalog" hint="About 2,000 well-known songs from the 1950s to today, tagged with year and genre." />
          <Toggle checked={has({ kind: "deezer-chart" })} onChange={(v) => toggle({ kind: "deezer-chart" }, v)} label="Global top 100 (live)" hint="Whatever is charting right now." />
        </div>
      )}
      {tab === "spotify" && <SpotifyTab has={has} toggle={toggle} />}
      {tab === "link" && <LinkTab add={add} />}
      {tab === "artists" && <ArtistTab has={has} add={add} />}

      <div className="mt-6 border-t border-line pt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">In this game</div>
        {sources.length === 0 ? (
          <p className="text-sm text-dim">Nothing selected yet. Pick at least one source above.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <span key={sourceKey(s)} className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 py-1 pl-3 pr-1.5 text-sm text-accent2 ring-1 ring-accent/30">
                {s.kind.startsWith("spotify") && <SpotifyLogo className="h-3.5 w-3.5 text-[#1ed760]" />}
                {describeSource(s)}
                <button type="button" aria-label={`Remove ${describeSource(s)}`} className="rounded-full p-0.5 text-accent2/70 hover:bg-accent/20 hover:text-fg" onClick={() => toggle(s, false)}>
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
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

  if (!user.ready) return <Spinner className="text-dim" />;

  if (!getClientId()) {
    return (
      <div className="text-sm text-dim">
        <p>Spotify login isn&apos;t set up on this site yet (no client ID). You can still paste public Spotify playlist, album or artist links in the &quot;Paste a link&quot; tab.</p>
        <ClientIdSettings />
      </div>
    );
  }

  if (!user.connected) {
    return (
      <div className="space-y-3 text-sm text-dim">
        <p>Connect to play with your Liked Songs, playlists, saved albums, top tracks and followed artists.</p>
        <ConnectButton />
        <p className="text-xs text-faint">
          Spotify only lets accounts on this app&apos;s user list sign in while it is in development mode. If yours isn&apos;t on it, paste a link to any public playlist, album or artist instead.
        </p>
        <ClientIdSettings />
      </div>
    );
  }

  const filtered = (playlists ?? []).filter((p) => p.name.toLowerCase().includes(plFilter.toLowerCase()));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-2 text-dim">
          <SpotifyLogo className="h-4 w-4 text-[#1ed760]" /> Connected as <span className="text-fg">{user.name}</span>
        </span>
        <button
          type="button"
          className="text-faint hover:text-fg"
          onClick={() => {
            import("@/lib/spotify/auth").then((m) => {
              m.logout();
              window.location.reload();
            });
          }}
        >
          Disconnect
        </button>
      </div>
      {user.error && <p className="mb-3 rounded-lg bg-bad/10 p-3 text-sm text-bad">{user.error}</p>}
      <div className="space-y-1">
        <Toggle checked={has({ kind: "spotify-liked" })} onChange={(v) => toggle({ kind: "spotify-liked" }, v)} label="Liked Songs" />
        <Toggle checked={has({ kind: "spotify-saved-albums" })} onChange={(v) => toggle({ kind: "spotify-saved-albums" }, v)} label="Saved albums" hint="Every track on every album in your library." />
        <Toggle checked={has({ kind: "spotify-followed-artists" })} onChange={(v) => toggle({ kind: "spotify-followed-artists" }, v)} label="Followed artists" hint="Popular songs from each artist you follow." />
        <Toggle checked={has({ kind: "spotify-recent" })} onChange={(v) => toggle({ kind: "spotify-recent" }, v)} label="Recently played" hint="Your last 50 plays." />
        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <span className="text-sm">Top tracks &amp; top artists</span>
          <Segmented<TimeRange>
            value={topRange}
            onChange={setTopRange}
            options={[
              { value: "short_term", label: "4 weeks" },
              { value: "medium_term", label: "6 months" },
              { value: "long_term", label: "All time" },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2 pb-2">
          <Chip selected={has({ kind: "spotify-top", range: topRange })} onClick={() => toggle({ kind: "spotify-top", range: topRange })}>My top tracks</Chip>
          <Chip selected={has({ kind: "spotify-top-artists", range: topRange })} onClick={() => toggle({ kind: "spotify-top-artists", range: topRange })}>My top artists</Chip>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-faint">Playlists</span>
          {playlists && playlists.length > 8 && <TextField className="max-w-48 py-1.5" placeholder="Filter" value={plFilter} onChange={(e) => setPlFilter(e.target.value)} />}
        </div>
        {plError && <p className="text-sm text-bad">{plError}</p>}
        {!playlists && !plError && <Spinner className="text-dim" />}
        {playlists && playlists.length === 0 && <p className="text-sm text-dim">No playlists in your library.</p>}
        <div className="grid max-h-80 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
          {filtered.map((p) => {
            const spec: SourceSpec = { kind: "spotify-playlist", id: p.id, name: p.name };
            const on = has(spec);
            const img = playlistImage(p);
            const count = playlistCount(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(spec)}
                className={cx("flex items-center gap-3 rounded-xl p-2 text-left transition", on ? "bg-accent/10 ring-1 ring-accent/40" : "hover:bg-panel2")}
              >
                {img ? <img src={img} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-md bg-line" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm">{p.name}</span>
                  <span className="block truncate text-xs text-faint">
                    {count != null ? `${count} songs` : ""}
                    {p.owner?.display_name ? ` · ${p.owner.display_name}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LinkTab({ add }: { add: (s: SourceSpec) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    const link = parseMusicLink(value);
    if (!link) return setMsg({ ok: false, text: "That doesn't look like a Spotify or Deezer playlist, album or artist link." });
    if (link.type === "track") return setMsg({ ok: false, text: "Paste a playlist, album or artist link (a single song isn't much of a game)." });
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
    <div>
      <p className="mb-3 text-sm text-dim">
        Paste any public Spotify (or Deezer) playlist, album or artist link. No login needed, so this also works for friends and for playlists you don&apos;t own.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://open.spotify.com/playlist/..." />
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy ? <Spinner /> : "Add"}
        </Button>
      </form>
      {msg && <p className={cx("mt-2 text-sm", msg.ok ? "text-good" : "text-bad")}>{msg.text}</p>}
      <p className="mt-3 text-xs text-faint">Links read without a login include up to 100 songs per playlist and the top songs of an artist.</p>
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
    <div>
      <p className="mb-3 text-sm text-dim">Add any artist to play their most popular songs.</p>
      <div className="relative">
        <TextField value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artists" />
        {busy && <Spinner className="absolute right-3 top-3 text-dim" />}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {results.map((a) => {
          const spec: SourceSpec = { kind: "deezer-artist", id: a.id, name: a.name };
          const on = has(spec);
          return (
            <button key={a.id} type="button" disabled={on} onClick={() => add(spec)} className={cx("flex items-center gap-3 rounded-xl p-2 text-left transition", on ? "bg-accent/10 ring-1 ring-accent/40" : "hover:bg-panel2")}>
              {a.picture_medium ? <img src={a.picture_medium} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="h-10 w-10 rounded-full bg-line" />}
              <span className="min-w-0">
                <span className="block truncate text-sm">{a.name}</span>
                <span className="block text-xs text-faint">{on ? "Added" : a.nb_fan ? `${a.nb_fan.toLocaleString()} fans` : ""}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
