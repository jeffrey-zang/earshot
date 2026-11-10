import type { GenreCode, Track } from "./types";

type Row = [string, string, string, number, number, string, string, number, number, number, string, string?, number?, number?];

let cache: Promise<Track[]> | null = null;

/** Cover art: Apple Music ("it:…"), else Deezer by image id ("dz:…") or album id ("dza:…", a redirect). */
function coverUrl(id?: string): string | undefined {
  if (id?.startsWith("it:")) return `https://is1-ssl.mzstatic.com/image/thumb/${id.slice(3)}/500x500bb.jpg`;
  if (id?.startsWith("dz:")) return `https://cdn-images.dzcdn.net/images/cover/${id.slice(3)}/500x500-000000-80-0-0.jpg`;
  if (id?.startsWith("dza:")) return `https://api.deezer.com/album/${id.slice(4)}/image?size=big`;
  return undefined;
}

/** The built-in pool: 1980+ songs ranked by Spotify streams (built by scripts/build-catalog.mjs). */
export function loadCatalog(): Promise<Track[]> {
  if (!cache) {
    cache = fetch("/catalog.json")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load the song catalog");
        return r.json();
      })
      .then((data: { tracks: Row[] }) =>
        data.tracks.map(([id, title, artists, year, decade, genres, , dur, explicit, deezerId, imageId, album, streams, english]) => ({
          key: `sp:${id}`,
          spotifyId: id,
          title,
          artists: artists.split("|"),
          year: year || undefined,
          decade: decade || undefined,
          genres: genres ? (genres.split(",") as GenreCode[]) : [],
          durationMs: dur * 1000,
          explicit: !!explicit,
          deezerId: deezerId || undefined,
          image: coverUrl(imageId),
          album: album || undefined,
          streams: streams || undefined,
          foreign: english === 0 || undefined,
          sourceLabel: "Hits catalog",
        })),
      );
    cache.catch(() => (cache = null));
  }
  return cache;
}
