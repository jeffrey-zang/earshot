import type { Track } from "./types";
import { dz, dzFindTrack, dzIsOtherVersion, type DzTrack } from "./deezer";
import { itunesFind } from "./itunes";

/** Spotify's previews (p.scdn.co) aren't allowed in games, so they're never played. */
const fromSpotify = (u?: string | null) => !!u && /(^|\.)scdn\.co\//.test(u.replace(/^https?:\/\//, ""));

/** Covers from Spotify are swapped for the album art of the clip we actually play. */
const spotifyImage = (u?: string) => !u || u.includes("i.scdn.co") || u.includes("api.deezer.com/album/");

/**
 * Yields candidate 30-second preview URLs for a track, best first: Deezer, then Apple (iTunes).
 * The caller tries each until one downloads and decodes. Also fills in artwork it learns.
 */
export async function* previewCandidates(t: Track): AsyncGenerator<string> {
  const tried = new Set<string>();
  const emit = (u?: string | null) => (u && !tried.has(u) && !fromSpotify(u) ? (tried.add(u), u) : null);

  // a preview the source already gave us (Deezer charts, iTunes), unless it's Spotify's
  let u = emit(t.previewUrl);
  if (u) yield u;

  // Deezer preview URLs expire after ~15 minutes, so they're always fetched fresh.
  try {
    let hit: DzTrack | null = null;
    if (t.deezerId) hit = await dz<DzTrack>(`track/${t.deezerId}`);
    // a stored match that turns out to be an instrumental, remix, live take…: look again
    if (hit && dzIsOtherVersion(hit, t.title)) hit = null;
    if (!hit) hit = await dzFindTrack(t.title, t.artists, t.durationMs);
    if (hit) {
      t.deezerId = hit.id;
      if (spotifyImage(t.image) && hit.album?.cover_medium) t.image = hit.album.cover_big ?? hit.album.cover_medium;
      u = emit(hit.preview);
      if (u) yield u;
    }
  } catch {
    /* ignore */
  }

  const it = await itunesFind(t.title, t.artists);
  if (it) {
    if (spotifyImage(t.image) && it.image) t.image = it.image;
    u = emit(it.previewUrl);
    if (u) yield u;
  }
}
