import type { Track } from "./types";
import { itunesFind } from "./itunes";
import { dz, dzFindTrack } from "./deezer";
import { mapGenres } from "./genres";
import { fetchEmbed } from "./embed";

/**
 * Fill in missing year / genre / artwork for a track, used when a filter needs data the source
 * didn't provide. iTunes first (one call gives year + genre), then Spotify embed, then Deezer.
 */
export async function enrichTrack(t: Track, need: { year: boolean; genre: boolean }): Promise<Track> {
  if (t.enriched) return t;
  const out: Track = { ...t, enriched: true };
  const it = await itunesFind(t.title, t.artists);
  if (it) {
    if (!out.year && it.year) out.year = it.year;
    if (!out.genres?.length && it.genre) out.genres = mapGenres([it.genre]);
    if (!out.image && it.image) out.image = it.image;
  }
  if (need.year && !out.year && out.spotifyId) {
    try {
      const e = await fetchEmbed("track", out.spotifyId);
      const y = e.tracks[0]?.year;
      if (y) out.year = y;
      if (!out.image && e.tracks[0]?.image) out.image = e.tracks[0].image;
    } catch {
      /* ignore */
    }
  }
  if ((need.genre && !out.genres?.length) || (need.year && !out.year && !out.fallbackYear)) {
    try {
      const hit = out.deezerId ? await dz<{ id: number; release_date?: string; album: { id: number } }>(`track/${out.deezerId}`) : await dzFindTrack(out.title, out.artists, out.durationMs);
      if (hit) {
        out.deezerId = hit.id;
        if (!out.fallbackYear && hit.release_date) out.fallbackYear = parseInt(hit.release_date.slice(0, 4), 10);
        if (need.genre && !out.genres?.length && hit.album?.id) {
          const album = await dz<{ genres?: { data: { name: string }[] }; release_date?: string }>(`album/${hit.album.id}`);
          out.genres = mapGenres((album.genres?.data ?? []).map((g) => g.name));
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (!out.year && out.fallbackYear) out.year = out.fallbackYear;
  return out;
}
