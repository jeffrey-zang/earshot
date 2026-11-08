import type { Track } from "./types";
import { dz, dzFindTrack, type DzTrack } from "./deezer";
import { itunesFind } from "./itunes";
import { fetchEmbed } from "./embed";

/**
 * Yields candidate 30-second preview URLs for a track, best first. The caller tries each until
 * one downloads and decodes. Also fills in artwork/year it learns along the way.
 */
export async function* previewCandidates(t: Track): AsyncGenerator<string> {
  const tried = new Set<string>();
  const emit = (u?: string | null) => (u && !tried.has(u) ? (tried.add(u), u) : null);

  let u = emit(t.previewUrl);
  if (u) yield u;

  if (t.spotifyId && !t.previewUrl) {
    try {
      const e = await fetchEmbed("track", t.spotifyId);
      const et = e.tracks[0];
      if (et) {
        t.image ??= et.image ?? undefined;
        t.year ??= et.year ?? undefined;
        u = emit(et.previewUrl);
        if (u) yield u;
      }
    } catch {
      /* ignore */
    }
  }

  // Deezer preview URLs expire after ~15 minutes, so they're always fetched fresh.
  try {
    let hit: DzTrack | null = null;
    if (t.deezerId) hit = await dz<DzTrack>(`track/${t.deezerId}`);
    else hit = await dzFindTrack(t.title, t.artists, t.durationMs);
    if (hit) {
      t.deezerId = hit.id;
      t.image ??= hit.album?.cover_medium;
      u = emit(hit.preview);
      if (u) yield u;
    }
  } catch {
    /* ignore */
  }

  const it = await itunesFind(t.title, t.artists);
  if (it) {
    t.image ??= it.image;
    u = emit(it.previewUrl);
    if (u) yield u;
  }
}
