import type { SpotifyLinkType, Track } from "./types";

export interface EmbedResult {
  type: SpotifyLinkType;
  id: string;
  name: string;
  image: string | null;
  tracks: { id: string; title: string; artists: string[]; durationMs?: number; explicit: boolean; previewUrl: string | null; year: number | null; image: string | null }[];
}

export async function fetchEmbed(type: SpotifyLinkType, id: string): Promise<EmbedResult> {
  const res = await fetch(`/api/spotify-embed?${new URLSearchParams({ type, id })}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || `Could not read that Spotify ${type}`);
  return data as EmbedResult;
}

export function embedToTracks(e: EmbedResult, label: string): Track[] {
  return e.tracks.map((t) => ({
    key: `sp:${t.id}`,
    spotifyId: t.id,
    title: t.title,
    artists: t.artists,
    durationMs: t.durationMs,
    explicit: t.explicit,
    previewUrl: t.previewUrl ?? undefined,
    year: t.year ?? undefined,
    image: t.image ?? (e.type === "album" ? e.image ?? undefined : undefined),
    sourceLabel: label,
  }));
}

/** Parse Spotify or Deezer share links / URIs. */
export function parseMusicLink(input: string):
  | { service: "spotify"; type: SpotifyLinkType; id: string }
  | { service: "deezer"; type: "playlist" | "album" | "artist" | "track"; id: number }
  | null {
  const s = input.trim();
  let m = s.match(/^spotify:(playlist|album|artist|track):([A-Za-z0-9]+)$/);
  if (m) return { service: "spotify", type: m[1] as SpotifyLinkType, id: m[2] };
  m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|artist|track)\/([A-Za-z0-9]+)/);
  if (m) return { service: "spotify", type: m[1] as SpotifyLinkType, id: m[2] };
  m = s.match(/deezer\.com\/(?:[a-z]{2}\/)?(playlist|album|artist|track)\/(\d+)/);
  if (m) return { service: "deezer", type: m[1] as "playlist", id: parseInt(m[2], 10) };
  return null;
}
