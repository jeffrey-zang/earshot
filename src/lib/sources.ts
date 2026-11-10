import type { ArtistRef, SourceSpec, Track } from "./types";
import { loadCatalog } from "./catalog";
import { dz, dzArtistTop, dzToTrack, type DzList, type DzTrack } from "./deezer";
import { embedToTracks, fetchEmbed } from "./embed";
import * as spotify from "./spotify/api";
import { SpotifyError } from "./spotify/api";

export interface LoadedSource {
  tracks: Track[];
  artists: ArtistRef[];
  /** Non-fatal notes, e.g. "only the first 100 tracks". */
  notes: string[];
}

const RANGE: Record<string, string> = { short_term: "last 4 weeks", medium_term: "last 6 months", long_term: "all time" };

export function describeSource(s: SourceSpec): string {
  switch (s.kind) {
    case "catalog": return "Hits catalog";
    case "deezer-chart": return "Global top 100 (live)";
    case "deezer-artist": return s.name;
    case "deezer-playlist": return `Deezer playlist: ${s.name}`;
    case "deezer-album": return `Deezer album: ${s.name}`;
    case "spotify-link": return s.name || `Spotify ${s.type}`;
    case "spotify-liked": return "My Liked Songs";
    case "spotify-top": return `My top tracks (${RANGE[s.range]})`;
    case "spotify-recent": return "My recently played";
    case "spotify-playlist": return s.name;
    case "spotify-saved-albums": return "My saved albums";
    case "spotify-followed-artists": return "My followed artists";
    case "spotify-top-artists": return `My top artists (${RANGE[s.range]})`;
  }
}

export function sourceKey(s: SourceSpec): string {
  return JSON.stringify(s);
}

/** Name of the playlist a source represents, if it is one (for "which playlist" rounds). */
export function playlistName(s: SourceSpec): string | null {
  if (s.kind === "spotify-playlist" || s.kind === "deezer-playlist") return s.name;
  if (s.kind === "spotify-link" && s.type === "playlist") return s.name;
  return null;
}

export function needsSpotifyLogin(s: SourceSpec): boolean {
  return s.kind.startsWith("spotify-") && s.kind !== "spotify-link";
}

async function deezerPaged(path: string, label: string, max = 2000): Promise<Track[]> {
  const out: Track[] = [];
  let index = 0;
  while (out.length < max) {
    const page = await dz<DzList<DzTrack>>(path, { limit: 100, index });
    const data = page.data ?? [];
    out.push(...data.map((t) => dzToTrack(t, label)));
    if (!page.next || !data.length) break;
    index += data.length;
  }
  return out;
}

export async function loadSource(s: SourceSpec, progress: (msg: string) => void): Promise<LoadedSource> {
  const label = describeSource(s);
  const res = (tracks: Track[], notes: string[] = []): LoadedSource => ({ tracks, artists: [], notes });
  switch (s.kind) {
    case "catalog":
      progress("Loading hits catalog");
      return res(await loadCatalog());
    case "deezer-chart":
      progress("Loading global top 100");
      return res(await deezerPaged("chart/0/tracks", label, 100));
    case "deezer-artist":
      progress(`Loading ${s.name}`);
      return res((await dzArtistTop(s.id, 100)).map((t) => dzToTrack(t, s.name)));
    case "deezer-playlist": {
      progress(`Loading ${s.name}`);
      const tracks = await deezerPaged(`playlist/${s.id}/tracks`, label);
      for (const t of tracks) t.playlists = [s.name];
      return res(tracks);
    }
    case "deezer-album": {
      progress(`Loading ${s.name}`);
      const album = await dz<{ title: string; cover_medium?: string; release_date?: string; tracks: { data: DzTrack[] } }>(`album/${s.id}`);
      return res(album.tracks.data.map((t) => ({ ...dzToTrack({ ...t, album: { id: s.id, title: album.title, cover_medium: album.cover_medium, release_date: album.release_date } }, label) })));
    }
    case "spotify-link": {
      progress(`Loading ${label}`);
      const e = await fetchEmbed(s.type, s.id);
      if (s.type === "artist") {
        // The embed only lists 10 tracks; expand the artist lazily during the game for more.
        return { tracks: embedToTracks(e, e.name), artists: [{ key: `spa:${s.id}`, name: e.name, spotifyId: s.id, sourceLabel: e.name }], notes: [] };
      }
      const notes = s.type === "playlist" && e.tracks.length >= 100 ? [`${e.name}: first 100 songs only`] : [];
      const tracks = embedToTracks(e, e.name);
      if (s.type === "playlist") for (const t of tracks) t.playlists = [e.name];
      return res(tracks, notes);
    }
    case "spotify-liked":
      return res(await spotify.getLikedTracks(progress));
    case "spotify-top":
      progress(label);
      return res(await spotify.getTopTracks(s.range));
    case "spotify-recent":
      progress(label);
      return res(await spotify.getRecentTracks());
    case "spotify-playlist":
      progress(`Loading ${s.name}`);
      try {
        return res(await spotify.getPlaylistTracks(s.id, s.name, progress));
      } catch (e) {
        if (!(e instanceof SpotifyError) || (e.status !== 403 && e.status !== 404)) throw e;
        // Spotify only lets development-mode apps read playlists you own; use the public embed instead.
        const embed = await fetchEmbed("playlist", s.id);
        const tracks = embedToTracks(embed, s.name);
        for (const t of tracks) t.playlists = [s.name];
        return res(tracks, embed.tracks.length >= 100 ? [`${s.name}: first 100 songs only`] : []);
      }
    case "spotify-saved-albums":
      return res(await spotify.getSavedAlbumTracks(progress));
    case "spotify-followed-artists":
      return { tracks: [], artists: await spotify.getFollowedArtists(progress), notes: [] };
    case "spotify-top-artists":
      progress(label);
      return { tracks: [], artists: await spotify.getTopArtists(s.range), notes: [] };
  }
}

/** Fetch songs for a lazily expanded artist: Spotify top tracks if available, else Deezer. */
export async function expandArtist(a: ArtistRef, limit: number): Promise<Track[]> {
  const label = a.sourceLabel ?? a.name;
  if (a.spotifyId) {
    const top = await spotify.getArtistTopTracks(a.spotifyId, label).catch(() => null);
    if (top?.length && limit <= top.length) return top.slice(0, limit);
  }
  let id = a.deezerId;
  if (!id) {
    const { dzFindArtist } = await import("./deezer");
    id = (await dzFindArtist(a.name))?.id;
  }
  if (!id) return [];
  const tracks = await dzArtistTop(id, Math.max(limit, 10));
  return tracks.map((t) => dzToTrack(t, label)).slice(0, limit);
}
