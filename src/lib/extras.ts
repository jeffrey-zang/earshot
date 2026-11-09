import type { GameSettings, Track } from "./types";
import { fetchLastfm } from "./lastfm";
import { fetchLyrics } from "./lyrics";
import { dz, dzFindTrack, type DzTrack } from "./deezer";
import { enrichTrack } from "./enrich";

async function deezerRank(t: Track): Promise<number | null> {
  try {
    const hit = t.deezerId ? await dz<DzTrack & { rank?: number }>(`track/${t.deezerId}`) : ((await dzFindTrack(t.title, t.artists, t.durationMs)) as (DzTrack & { rank?: number }) | null);
    if (!hit) return null;
    t.deezerId = hit.id;
    t.image ??= hit.album?.cover_medium;
    return typeof hit.rank === "number" ? hit.rank : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the per-song data a round needs (lyrics, play counts, popularity). Returns false when a
 * required piece is missing, so the game skips to another song.
 */
export async function ensureExtras(t: Track, s: GameSettings): Promise<boolean> {
  const wantsPlays =
    (s.mode === "classic" && (s.fields.includes("plays") || s.fields.includes("myplays"))) || (s.mode === "higherlower" && s.hlMetric === "plays");
  if (wantsPlays && !t.lastfm) {
    const lf = await fetchLastfm(t, s.fields.includes("myplays") ? s.lastfmUser.trim() : undefined);
    if (!lf) return false;
    t.lastfm = lf;
  }
  if (s.mode === "classic" && s.fields.includes("myplays") && t.lastfm?.userplaycount == null) return false;
  if (s.mode === "lyrics" && !t.lyrics) {
    const l = await fetchLyrics(t);
    if (!l) return false;
    t.lyrics = l;
  }
  if (s.mode === "higherlower") {
    if (s.hlMetric === "popularity" && t.rank == null) {
      const r = await deezerRank(t);
      if (r == null) return false;
      t.rank = r;
    }
    if (s.hlMetric === "year" && !t.year) {
      Object.assign(t, await enrichTrack(t, { year: true, genre: false }));
      if (!t.year) return false;
    }
    if (s.hlMetric === "added" && !t.addedAt) return false;
  }
  return true;
}

/** The number higher-or-lower compares. */
export function metricValue(t: Track, s: GameSettings): number | null {
  switch (s.hlMetric) {
    case "year": return t.year ?? null;
    case "popularity": return t.rank ?? null;
    case "plays": return t.lastfm?.playcount ?? null;
    case "added": return t.addedAt ? Date.parse(t.addedAt) : null;
  }
}
