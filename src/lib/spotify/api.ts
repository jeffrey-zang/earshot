import type { ArtistRef, TimeRange, Track } from "../types";
import { getAccessToken } from "./auth";

export class SpotifyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const API = "https://api.spotify.com/v1";

export async function sp<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new SpotifyError(401, "Not connected to Spotify");
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && !retried) {
    await getAccessToken(true);
    return sp<T>(path, init, true);
  }
  if (res.status === 429) {
    const wait = Math.min(10, parseInt(res.headers.get("retry-after") || "2", 10)) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return sp<T>(path, init, retried);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `Spotify request failed (${res.status})`;
    throw new SpotifyError(res.status, msg);
  }
  return data as T;
}

interface SpImage { url: string; width?: number }
interface SpArtist { id: string; name: string; genres?: string[]; images?: SpImage[] }
interface SpAlbum { id: string; name: string; release_date?: string; images?: SpImage[]; tracks?: { items: SpTrack[] }; artists?: SpArtist[] }
export interface SpTrack {
  id: string | null;
  name: string;
  type?: string;
  is_local?: boolean;
  duration_ms?: number;
  explicit?: boolean;
  artists: SpArtist[];
  album?: SpAlbum;
  preview_url?: string | null;
}
interface Page<T> { items: T[]; next: string | null; total?: number }
export interface SpPlaylist { id: string; name: string; images?: SpImage[] | null; owner?: { display_name?: string; id?: string }; tracks?: { total: number }; items?: { total: number } }

function pickImage(images?: SpImage[] | null): string | undefined {
  if (!images?.length) return undefined;
  return (images.find((i) => (i.width ?? 0) >= 250 && (i.width ?? 0) <= 400) ?? images[0]).url;
}

export function spToTrack(t: SpTrack, sourceLabel: string, album?: SpAlbum): Track | null {
  if (!t?.id || t.is_local || (t.type && t.type !== "track")) return null;
  const al = t.album ?? album;
  const year = al?.release_date ? parseInt(al.release_date.slice(0, 4), 10) : undefined;
  return {
    key: `sp:${t.id}`,
    spotifyId: t.id,
    title: t.name,
    artists: t.artists.map((a) => a.name),
    album: al?.name,
    year: year && year > 1800 ? year : undefined,
    durationMs: t.duration_ms,
    explicit: t.explicit,
    image: pickImage(al?.images),
    previewUrl: t.preview_url || undefined,
    sourceLabel,
  };
}

async function collect<T>(first: string, onPage?: (count: number, total?: number) => void, max = 10_000): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = first;
  while (url && out.length < max) {
    const page: Page<T> = await sp<Page<T>>(url);
    out.push(...page.items);
    onPage?.(out.length, page.total);
    url = page.next;
  }
  return out;
}

export async function getMe(): Promise<{ id: string; display_name?: string; product?: string; images?: SpImage[] }> {
  return sp("/me");
}

type Progress = (msg: string) => void;

function withAdded(t: Track | null, addedAt?: string | null, playlist?: string): Track | null {
  if (!t) return null;
  if (addedAt && !addedAt.startsWith("1970")) t.addedAt = addedAt;
  if (playlist) t.playlists = [playlist];
  return t;
}

export async function getLikedTracks(progress?: Progress): Promise<Track[]> {
  const items = await collect<{ track: SpTrack; added_at?: string }>("/me/tracks?limit=50", (n, total) => progress?.(`Liked Songs: ${n}${total ? ` / ${total}` : ""}`));
  return items.map((i) => withAdded(spToTrack(i.track, "Liked Songs"), i.added_at)).filter((t): t is Track => !!t);
}

const RANGE_LABEL: Record<TimeRange, string> = { short_term: "last 4 weeks", medium_term: "last 6 months", long_term: "all time" };

export async function getTopTracks(range: TimeRange): Promise<Track[]> {
  const items = await collect<SpTrack>(`/me/top/tracks?limit=50&time_range=${range}`, undefined, 200);
  return items.map((t) => spToTrack(t, `Top tracks (${RANGE_LABEL[range]})`)).filter((t): t is Track => !!t);
}

export async function getRecentTracks(): Promise<Track[]> {
  const page = await sp<Page<{ track: SpTrack }>>("/me/player/recently-played?limit=50");
  return page.items.map((i) => spToTrack(i.track, "Recently played")).filter((t): t is Track => !!t);
}

export async function getMyPlaylists(): Promise<SpPlaylist[]> {
  return collect<SpPlaylist>("/me/playlists?limit=50", undefined, 1000);
}

export function playlistImage(p: SpPlaylist) {
  return pickImage(p.images);
}

export function playlistCount(p: SpPlaylist): number | undefined {
  return p.items?.total ?? p.tracks?.total;
}

/**
 * Playlist contents. Development-mode Spotify apps can only read playlists the user owns or
 * collaborates on, so callers fall back to the public embed page when this throws 403/404.
 */
export async function getPlaylistTracks(id: string, name: string, progress?: Progress): Promise<Track[]> {
  type Entry = { item?: SpTrack; track?: SpTrack; added_at?: string };
  let items: Entry[];
  try {
    items = await collect<Entry>(`/playlists/${id}/items?limit=50`, (n, total) => progress?.(`${name}: ${n}${total ? ` / ${total}` : ""}`));
  } catch (e) {
    if (!(e instanceof SpotifyError) || (e.status !== 404 && e.status !== 400)) throw e;
    items = await collect<Entry>(`/playlists/${id}/tracks?limit=50`, (n, total) => progress?.(`${name}: ${n}${total ? ` / ${total}` : ""}`));
  }
  return items.map((i) => withAdded(spToTrack((i.item ?? i.track) as SpTrack, name), i.added_at, name)).filter((t): t is Track => !!t);
}

export async function getSavedAlbumTracks(progress?: Progress): Promise<Track[]> {
  const items = await collect<{ album: SpAlbum; added_at?: string }>("/me/albums?limit=50", (n, total) => progress?.(`Saved albums: ${n}${total ? ` / ${total}` : ""}`));
  return items.flatMap(({ album, added_at }) => (album.tracks?.items ?? []).map((t) => withAdded(spToTrack(t, `Album: ${album.name}`, album), added_at))).filter((t): t is Track => !!t);
}

export async function getFollowedArtists(progress?: Progress): Promise<ArtistRef[]> {
  const out: ArtistRef[] = [];
  let url: string | null = "/me/following?type=artist&limit=50";
  while (url) {
    const page: { artists: Page<SpArtist> } = await sp(url);
    out.push(...page.artists.items.map((a) => ({ key: `spa:${a.id}`, name: a.name, spotifyId: a.id, sourceLabel: "Followed artists" })));
    progress?.(`Followed artists: ${out.length}`);
    url = page.artists.next;
  }
  return out;
}

export async function getTopArtists(range: TimeRange): Promise<ArtistRef[]> {
  const items = await collect<SpArtist>(`/me/top/artists?limit=50&time_range=${range}`, undefined, 100);
  return items.map((a) => ({ key: `spa:${a.id}`, name: a.name, spotifyId: a.id, sourceLabel: `Top artists (${RANGE_LABEL[range]})` }));
}

let artistTopTracksWorks = true;

/** Artist top tracks via the Web API. Returns null if the endpoint isn't available to this app. */
export async function getArtistTopTracks(artistId: string, label: string): Promise<Track[] | null> {
  if (!artistTopTracksWorks) return null;
  try {
    const r = await sp<{ tracks: SpTrack[] }>(`/artists/${artistId}/top-tracks?market=from_token`);
    return r.tracks.map((t) => spToTrack(t, label)).filter((t): t is Track => !!t);
  } catch (e) {
    if (e instanceof SpotifyError && (e.status === 403 || e.status === 404 || e.status === 410)) artistTopTracksWorks = false;
    return null;
  }
}

/** Find a Spotify track id for a song (used by full-track playback for non-Spotify sources). */
export async function searchTrackId(title: string, artist: string): Promise<string | null> {
  const plain = title.replace(/\s+[-–—]\s+.*$/, "").replace(/\(.*?\)/g, "").trim();
  const q = `track:${plain} artist:${artist}`;
  const r = await sp<{ tracks: Page<SpTrack> }>(`/search?type=track&limit=5&q=${encodeURIComponent(q)}`);
  return r.tracks.items[0]?.id ?? null;
}
