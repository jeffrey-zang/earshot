import type { GenreCode, Track } from "./types";

type Row = [string, string, string, number, number, string, string, number, number, number, string, string?];

let cache: Promise<Track[]> | null = null;

/** The built-in catalog (built by scripts/build-catalog.mjs from public editorial playlists). */
export function loadCatalog(): Promise<Track[]> {
  if (!cache) {
    cache = fetch("/catalog.json")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load the song catalog");
        return r.json();
      })
      .then((data: { tracks: Row[] }) =>
        data.tracks.map(([id, title, artists, year, decade, genres, previewId, dur, explicit, deezerId, imageId, album]) => ({
          key: `sp:${id}`,
          spotifyId: id,
          title,
          artists: artists.split("|"),
          year: year || undefined,
          decade: decade || undefined,
          genres: genres ? (genres.split(",") as GenreCode[]) : [],
          previewUrl: `https://p.scdn.co/mp3-preview/${previewId}`,
          durationMs: dur * 1000,
          explicit: !!explicit,
          deezerId: deezerId || undefined,
          image: imageId ? `https://i.scdn.co/image/ab67616d00001e02${imageId}` : undefined,
          album: album || undefined,
          sourceLabel: "Hits catalog",
        })),
      );
    cache.catch(() => (cache = null));
  }
  return cache;
}
