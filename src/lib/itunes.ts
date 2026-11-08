import { artistsOverlap, normTitle } from "./text";

export interface ItunesHit {
  trackId: number;
  previewUrl?: string;
  year?: number;
  genre?: string;
  image?: string;
  title: string;
  artist: string;
}

interface ItunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  previewUrl?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
}

// iTunes Search sends CORS headers, so the browser calls it directly (rate limits then apply per player).
export async function itunesFind(title: string, artists: string[]): Promise<ItunesHit | null> {
  const plainTitle = title.replace(/\s+[-–—]\s+.*$/, "").replace(/\(.*?\)|\[.*?\]/g, "").trim();
  const term = `${artists[0] ?? ""} ${plainTitle}`.trim();
  try {
    const res = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term, entity: "song", media: "music", limit: "15" })}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: ItunesResult[] };
    const nt = normTitle(title);
    const hits = (data.results ?? []).filter((r) => normTitle(r.trackName) === nt && artistsOverlap([r.artistName], artists));
    if (!hits.length) return null;
    // Earliest release is the closest to the original (later ones tend to be compilations).
    hits.sort((a, b) => (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999"));
    const h = hits.find((x) => x.previewUrl) ?? hits[0];
    return {
      trackId: h.trackId,
      previewUrl: h.previewUrl,
      year: hits[0].releaseDate ? parseInt(hits[0].releaseDate.slice(0, 4), 10) : undefined,
      genre: h.primaryGenreName,
      image: h.artworkUrl100?.replace("100x100", "300x300"),
      title: h.trackName,
      artist: h.artistName,
    };
  } catch {
    return null;
  }
}
