import type { GameSettings, Track } from "./types";
import { dz, dzToTrack, type DzTrack } from "./deezer";
import { embedToTracks, fetchEmbed } from "./embed";

/** A shareable game: the exact songs + settings, so a friend can play the same rounds. */
export interface Challenge {
  v: 1;
  t: string[];
  s: Partial<GameSettings>;
  seed: number;
  by?: string;
  score?: number;
}

const SHARED_SETTINGS: (keyof GameSettings)[] = ["steps", "startMode", "maxPoints", "halfLife", "wrongPenalty", "wrongUnlocks", "strictArtist", "mode", "fields", "twist", "lyricLead", "hlMetric", "hlLives"];

/** Questions that depend on the player's own library or Last.fm account can't be shared. */
const PERSONAL_FIELDS = new Set(["myplays", "added", "playlist"]);

/** Whether a game with these settings can be replayed by someone else. */
export function canShare(settings: GameSettings): boolean {
  if (settings.mode === "higherlower") return settings.hlMetric !== "added";
  if (settings.mode === "classic") return settings.fields.some((f) => !PERSONAL_FIELDS.has(f));
  return true;
}

export function makeChallenge(tracks: Track[], settings: GameSettings, seed: number, score?: number, by?: string): Challenge {
  const s: Partial<GameSettings> = {};
  for (const k of SHARED_SETTINGS) (s as Record<string, unknown>)[k] = settings[k];
  if (s.fields) s.fields = s.fields.filter((f) => !PERSONAL_FIELDS.has(f));
  // higher-or-lower is a chain: the first song is the starting point
  return { v: 1, t: tracks.map((t) => t.key), s, seed, score, by };
}

export function encodeChallenge(c: Challenge): string {
  const json = JSON.stringify(c);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeChallenge(code: string): Challenge | null {
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const c = JSON.parse(json) as Challenge;
    return c.v === 1 && Array.isArray(c.t) ? c : null;
  } catch {
    return null;
  }
}

/** Turn challenge keys back into tracks (no login needed). */
export async function loadChallengeTracks(keys: string[]): Promise<Track[]> {
  const out = await Promise.all(
    keys.map(async (key): Promise<Track | null> => {
      const [kind, id] = key.split(":");
      try {
        if (kind === "sp") {
          const e = await fetchEmbed("track", id);
          return embedToTracks(e, "Challenge")[0] ?? null;
        }
        if (kind === "dz") return dzToTrack(await dz<DzTrack>(`track/${id}`), "Challenge");
      } catch {
        /* skip */
      }
      return null;
    }),
  );
  return out.filter((t): t is Track => !!t);
}
