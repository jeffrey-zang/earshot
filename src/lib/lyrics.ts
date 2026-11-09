import type { Track } from "./types";
import { artistsOverlap, normTitle } from "./text";

// Lyrics come from LRCLIB (lrclib.net), a free database of synced lyrics. It sends CORS headers,
// so the browser calls it directly.

interface LrcRecord {
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export type LyricLine = { time: number | null; text: string };

export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split("\n")) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    if (!stamps.length || !text) continue;
    for (const s of stamps) out.push({ time: parseInt(s[1], 10) * 60 + parseFloat(s[2]), text });
  }
  return out.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

async function lrclib(path: string): Promise<unknown> {
  const res = await fetch(`https://lrclib.net/api/${path}`);
  if (!res.ok) return null;
  return res.json();
}

/** Synced lyrics (preferred) or plain lyrics for a track, or null if none are known. */
export async function fetchLyrics(t: Track): Promise<Track["lyrics"] | null> {
  const plainTitle = t.title.replace(/\s+[-–—]\s+.*$/, "").replace(/\(.*?\)|\[.*?\]/g, "").trim();
  const params = new URLSearchParams({ track_name: plainTitle, artist_name: t.artists[0] ?? "" });
  let results = (await lrclib(`search?${params}`).catch(() => null)) as LrcRecord[] | null;
  if (!Array.isArray(results) || !results.length) {
    results = (await lrclib(`search?${new URLSearchParams({ q: `${t.artists[0] ?? ""} ${plainTitle}` })}`).catch(() => null)) as LrcRecord[] | null;
  }
  if (!Array.isArray(results)) return null;
  const nt = normTitle(t.title);
  const durSec = t.durationMs ? t.durationMs / 1000 : null;
  const matches = results.filter(
    (r) => !r.instrumental && (normTitle(r.trackName) === nt || normTitle(r.trackName).endsWith(nt)) && artistsOverlap([r.artistName], t.artists),
  );
  if (!matches.length) return null;
  // Prefer synced lyrics from a version with the same length (timestamps must line up with the audio).
  const score = (r: LrcRecord) => (r.syncedLyrics ? 0 : 1000) + (durSec && r.duration ? Math.abs(r.duration - durSec) : 30);
  matches.sort((a, b) => score(a) - score(b));
  const best = matches[0];
  if (best.syncedLyrics && (!durSec || !best.duration || Math.abs(best.duration - durSec) <= 3)) {
    const lines = parseLrc(best.syncedLyrics);
    if (lines.length >= 4) return { lines, synced: true };
  }
  const plain = best.plainLyrics ?? (best.syncedLyrics ? parseLrc(best.syncedLyrics).map((l) => l.text).join("\n") : null);
  if (!plain) return null;
  const lines = plain.split("\n").map((s) => s.trim()).filter(Boolean).map((text) => ({ time: null, text }));
  return lines.length >= 4 ? { lines, synced: false } : null;
}

export function lyricWords(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Pick the line to guess. It needs a line before it, at least 3 words, must not just repeat the
 * previous line, and (for audio-aligned play) must start late enough to have `lead` seconds before it.
 */
export function pickLine(lines: LyricLine[], rand: () => number, lead: number | null): number | null {
  const ok: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const w = lyricWords(lines[i].text);
    if (w.length < 3 || w.length > 16) continue;
    if (lines[i].text.toLowerCase() === lines[i - 1].text.toLowerCase()) continue;
    if (/^\(.*\)$/.test(lines[i].text)) continue;
    if (lead != null && (lines[i].time == null || lines[i].time! < lead + 0.5)) continue;
    ok.push(i);
  }
  if (!ok.length) return null;
  return ok[Math.floor(rand() * ok.length)];
}

/** How close a typed line is to the real one: word-level LCS, Dice style (0..1). */
export function lineSimilarity(guess: string, answer: string): number {
  const a = lyricWords(guess);
  const b = lyricWords(answer);
  if (!a.length || !b.length) return 0;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return (2 * dp[a.length][b.length]) / (a.length + b.length);
}

/** Words of the real line, marking which ones the guess got (in order). */
export function markWords(guess: string, answer: string): { word: string; hit: boolean }[] {
  const raw = answer.split(/\s+/).filter(Boolean);
  const g = lyricWords(guess);
  let gi = 0;
  return raw.map((word) => {
    const w = lyricWords(word).join("");
    const idx = g.indexOf(w, gi);
    if (w && idx >= 0) {
      gi = idx + 1;
      return { word, hit: true };
    }
    return { word, hit: false };
  });
}

/** "_____ ___ ____" for the shape hint. */
export function lineShape(answer: string): string {
  return answer
    .split(/\s+/)
    .map((w) => w.replace(/[\p{L}\p{N}]/gu, "_"))
    .join("  ");
}
