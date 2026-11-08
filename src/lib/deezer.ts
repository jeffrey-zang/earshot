import type { Track } from "./types";
import { artistsOverlap, normArtist, normTitle } from "./text";

export interface DzTrack {
  id: number;
  title: string;
  title_short?: string;
  duration?: number;
  explicit_lyrics?: boolean;
  preview?: string;
  release_date?: string;
  artist: { id: number; name: string; picture_medium?: string };
  contributors?: { name: string }[];
  album?: { id: number; title: string; cover_medium?: string; md5_image?: string; release_date?: string };
}

export interface DzArtist {
  id: number;
  name: string;
  picture_medium?: string;
  nb_fan?: number;
}

export interface DzList<T> {
  data?: T[];
  total?: number;
  next?: string;
  error?: { message: string; code?: number };
}

export async function dz<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`/api/deezer/${path}${qs.size ? `?${qs}` : ""}`);
    const data = await res.json().catch(() => null);
    // code 4 = quota exceeded; back off briefly and retry
    if (data?.error?.code === 4) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      continue;
    }
    if (!res.ok || !data) throw new Error(`Deezer request failed (${res.status})`);
    if (data.error) throw new Error(data.error.message || "Deezer error");
    return data as T;
  }
  throw new Error("Deezer is rate limiting requests, try again in a moment");
}

export function dzToTrack(t: DzTrack, sourceLabel?: string): Track {
  const artists = t.contributors?.length ? t.contributors.map((c) => c.name) : [t.artist.name];
  const date = t.release_date ?? t.album?.release_date;
  return {
    key: `dz:${t.id}`,
    title: t.title,
    artists: artists.includes(t.artist.name) ? artists : [t.artist.name, ...artists],
    album: t.album?.title,
    durationMs: t.duration ? t.duration * 1000 : undefined,
    explicit: t.explicit_lyrics,
    image: t.album?.cover_medium,
    deezerId: t.id,
    // Deezer dates are often reissue dates, so they are only a fallback (see enrichTrack).
    fallbackYear: date ? parseInt(date.slice(0, 4), 10) : undefined,
    sourceLabel,
  };
}

export async function dzSearchArtists(q: string, limit = 8): Promise<DzArtist[]> {
  const r = await dz<DzList<DzArtist>>("search/artist", { q, limit });
  return r.data ?? [];
}

export async function dzFindArtist(name: string): Promise<DzArtist | null> {
  const list = await dzSearchArtists(name, 5);
  const n = normArtist(name);
  return list.find((a) => normArtist(a.name) === n) ?? list[0] ?? null;
}

export async function dzArtistTop(id: number, limit = 25): Promise<DzTrack[]> {
  const r = await dz<DzList<DzTrack>>(`artist/${id}/top`, { limit });
  return r.data ?? [];
}

export async function dzSearchTracks(q: string, limit = 10): Promise<DzTrack[]> {
  const r = await dz<DzList<DzTrack>>("search", { q, limit });
  return r.data ?? [];
}

/** Find the Deezer version of a song by title + artist. */
export async function dzFindTrack(title: string, artists: string[], durationMs?: number): Promise<DzTrack | null> {
  const plainTitle = title.replace(/\s+[-–—]\s+.*$/, "").replace(/\(.*?\)|\[.*?\]/g, "").trim();
  const results = await dzSearchTracks(`${artists[0] ?? ""} ${plainTitle}`.trim(), 15);
  const nt = normTitle(title);
  const candidates = results.filter((r) => normTitle(r.title) === nt || normTitle(r.title_short ?? "") === nt);
  const withArtist = candidates.filter((r) => artistsOverlap([r.artist.name], artists));
  const pool = withArtist.length ? withArtist : [];
  if (!pool.length) return null;
  if (durationMs) {
    pool.sort((a, b) => Math.abs((a.duration ?? 0) * 1000 - durationMs) - Math.abs((b.duration ?? 0) * 1000 - durationMs));
  }
  return pool[0];
}
