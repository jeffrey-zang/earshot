import type { AnswerField, GameSettings, HLMetric, Track, Twist } from "./types";
import { artistsOverlap, cleanTitle, levenshtein, normArtist, normTitle, titlesMatch } from "./text";

export const FIELD_INFO: Record<AnswerField, { label: string; short: string; hint: string; kind: "text" | "graded" | "choice"; needs?: "spotify" | "lastfm" | "lastfmUser" | "playlists" }> = {
  title: { label: "Song", short: "Song", hint: "Name the song.", kind: "text" },
  artist: { label: "Artist", short: "Artist", hint: "Name who sings it. Any credited artist counts.", kind: "text" },
  album: { label: "Album", short: "Album", hint: "Name the album it's on. Reissues and deluxe editions count.", kind: "text" },
  year: { label: "Release year", short: "Year", hint: "Exact year scores full points; it halves every 2 years off.", kind: "graded" },
  plays: { label: "Plays", short: "Plays", hint: "Guess its total Last.fm plays. Within 2x of the real number keeps half the points.", kind: "graded", needs: "lastfm" },
  myplays: { label: "Your plays", short: "Your plays", hint: "How many times you've played it, from your Last.fm scrobbles.", kind: "graded", needs: "lastfmUser" },
  added: { label: "When you saved it", short: "Saved", hint: "The month you liked it or added it. Points halve every 4 months off.", kind: "graded", needs: "spotify" },
  playlist: { label: "Which playlist", short: "Playlist", hint: "Pick the playlist it's from. Needs two or more playlists in the game.", kind: "choice", needs: "playlists" },
};

export const FIELD_ORDER: AnswerField[] = ["title", "artist", "album", "year", "plays", "myplays", "added", "playlist"];

export const TWIST_INFO: Record<Twist, { label: string; hint: string }> = {
  none: { label: "None", hint: "" },
  reverse: { label: "Backwards", hint: "Snippets play in reverse." },
  fast: { label: "Sped up", hint: "1.5x speed and pitch." },
  slow: { label: "Slowed down", hint: "0.7x speed and pitch." },
  muffled: { label: "Muffled", hint: "Like hearing it through a wall." },
  random: { label: "Surprise me", hint: "A different twist every round." },
};

export const HL_INFO: Record<HLMetric, { label: string; question: string; higher: string; lower: string; needs?: "lastfm" | "spotify" }> = {
  year: { label: "Release year", question: "Did it come out before or after?", higher: "Later", lower: "Earlier" },
  popularity: { label: "Popularity", question: "Is it more or less popular?", higher: "More popular", lower: "Less popular" },
  plays: { label: "Last.fm plays", question: "More or fewer plays?", higher: "More plays", lower: "Fewer plays", needs: "lastfm" },
  added: { label: "When you saved it", question: "Did you save it before or after?", higher: "After", lower: "Before", needs: "spotify" },
};

/** Twist for a round: fixed, or picked by the round's seeded random. */
export function roundTwist(t: Twist, rand: () => number): Exclude<Twist, "random"> {
  if (t !== "random") return t;
  const options = ["reverse", "fast", "slow", "muffled"] as const;
  return options[Math.floor(rand() * options.length)];
}

const EDITION_RE = /\b(deluxe|expanded|anniversary|remaster(ed)?|special|collector'?s|edition|version|bonus tracks?|super|legacy|definitive|platinum|reissue)\b.*$/i;

export function normAlbum(s: string): string {
  return normTitle(s.replace(/\s+[-–—:]\s+.*$/, "")).replace(EDITION_RE, "").replace(/\b\d+(th|st|nd|rd)?\b\s*$/, "").trim();
}

export function albumAnswers(t: Track): string[] {
  return [...new Set([t.album, ...(t.albums ?? [])].filter((x): x is string => !!x))];
}

/** Is a text answer right? */
export function checkText(field: "title" | "artist" | "album", guess: string, t: Track, opts: { guessArtist?: string; strictArtist?: boolean }): boolean {
  if (field === "title") {
    const titleOk = titlesMatch(guess, t.title);
    const artistOk = !opts.guessArtist || !opts.strictArtist || artistsOverlap(opts.guessArtist.split(/,\s*/), t.artists);
    return titleOk && artistOk;
  }
  if (field === "artist") {
    if (artistsOverlap([guess], t.artists)) return true;
    const g = normArtist(guess);
    return g.length >= 5 && t.artists.some((a) => levenshtein(g, normArtist(a)) <= (g.length >= 10 ? 2 : 1));
  }
  const g = normAlbum(guess);
  if (!g) return false;
  return albumAnswers(t).some((a) => {
    const n = normAlbum(a);
    if (!n) return false;
    if (n === g) return true;
    const allowed = n.length >= 12 ? 2 : n.length >= 6 ? 1 : 0;
    return levenshtein(g, n) <= allowed;
  });
}

export function answerText(field: AnswerField, t: Track): string {
  switch (field) {
    case "title": return cleanTitle(t.title);
    case "artist": return t.artists.join(", ");
    case "album": return t.album ? cleanTitle(t.album) : "Unknown album";
    case "year": return t.year ? String(t.year) : "Unknown";
    case "plays": return t.lastfm ? formatCount(t.lastfm.playcount) : "Unknown";
    case "myplays": return t.lastfm?.userplaycount != null ? `${t.lastfm.userplaycount.toLocaleString()} play${t.lastfm.userplaycount === 1 ? "" : "s"}` : "Unknown";
    case "added": return t.addedAt ? formatMonth(t.addedAt) : "Unknown";
    case "playlist": return t.playlists?.join(" or ") ?? "Unknown";
  }
}

/** 0..1 credit for a graded answer, plus a short explanation. */
export function grade(field: "year" | "plays" | "myplays" | "added", guess: number, t: Track): { credit: number; detail: string } | null {
  if (field === "year") {
    if (!t.year) return null;
    const d = Math.abs(guess - t.year);
    return { credit: Math.pow(0.5, d / 2), detail: d === 0 ? "exact" : `off by ${d} year${d === 1 ? "" : "s"}` };
  }
  if (field === "plays" || field === "myplays") {
    const actual = field === "plays" ? t.lastfm?.playcount : t.lastfm?.userplaycount;
    if (actual == null) return null;
    const ratio = Math.abs(Math.log10((Math.max(0, guess) + 1) / (actual + 1)));
    const factor = Math.pow(10, ratio);
    return { credit: Math.pow(0.5, ratio / 0.3), detail: ratio < 0.005 ? "exact" : `${factor < 10 ? factor.toFixed(1) : Math.round(factor)}x ${guess > actual ? "too high" : "too low"}` };
  }
  if (!t.addedAt) return null;
  const d = new Date(t.addedAt);
  const actualMonths = d.getUTCFullYear() * 12 + d.getUTCMonth();
  const diff = Math.abs(guess - actualMonths);
  return { credit: Math.pow(0.5, diff / 4), detail: diff === 0 ? "right month" : `off by ${diff} month${diff === 1 ? "" : "s"}` };
}

export function formatCount(n: number): string {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  return n.toLocaleString();
}

/** "2.5m", "300k", "1,234" -> number */
export function parseCount(s: string): number | null {
  const m = s.trim().toLowerCase().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/);
  if (!m) return null;
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1;
  return Math.round(parseFloat(m[1]) * mult);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = MONTHS;

export function formatMonth(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Fields that need data the game can't get from this setup. */
export function unavailableFields(s: GameSettings, ctx: { spotify: boolean; lastfm: boolean; playlists: number }): AnswerField[] {
  return s.fields.filter((f) => {
    const need = FIELD_INFO[f].needs;
    if (need === "spotify") return !ctx.spotify;
    if (need === "lastfm") return !ctx.lastfm;
    if (need === "lastfmUser") return !ctx.lastfm || !s.lastfmUser.trim();
    if (need === "playlists") return ctx.playlists < 2;
    return false;
  });
}

/** One-line description of a game's mode, for summaries. */
export function describeMode(s: GameSettings): string {
  if (s.mode === "lyrics") return "Finish the lyric";
  if (s.mode === "higherlower") return `Higher or lower: ${HL_INFO[s.hlMetric].label.toLowerCase()}`;
  const fields = s.fields.map((f) => FIELD_INFO[f].short);
  const base = fields.length === 1 && fields[0] === "Song" ? "Name the song" : `Guess ${fields.join(" + ").toLowerCase()}`;
  return s.twist !== "none" ? `${base}, ${TWIST_INFO[s.twist].label.toLowerCase()}` : base;
}
