const VERSION_WORDS =
  "remaster|remastered|version|edit|mono|stereo|mix|live|single|radio|from|feat|featuring|with|recorded|re-recorded|anniversary|deluxe|bonus|demo|acoustic|instrumental|original|extended|explicit|clean|soundtrack|session|unplugged|reprise|sped up|slowed";

/** Display title: drop "- 2011 Remaster", "(feat. X)" and similar noise but keep meaningful subtitles. */
export function cleanTitle(title: string): string {
  let s = title;
  s = s.replace(new RegExp(`\\s+[-–—]\\s+[^-–—]*\\b(${VERSION_WORDS})\\b[^-–—]*$`, "i"), "");
  s = s.replace(
    new RegExp(`\\s*[\\(\\[][^\\)\\]]*\\b(${VERSION_WORDS}|ft\\.?|\\d{4})\\b[^\\)\\]]*[\\)\\]]`, "gi"),
    "",
  );
  return s.trim() || title.trim();
}

/** Aggressive normalization used for comparing guesses with answers. */
export function normTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\s+[-–—]\s+.*$/, " ")
    .replace(/\b(feat|ft|featuring)\b.*$/, " ")
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normArtist(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function titlesMatch(guess: string, answer: string): boolean {
  const g = normTitle(guess);
  const a = normTitle(answer);
  if (!g || !a) return false;
  if (g === a) return true;
  if (g.replace(/ /g, "") === a.replace(/ /g, "")) return true;
  // forgive small typos on longer titles
  const allowed = a.length >= 12 ? 2 : a.length >= 6 ? 1 : 0;
  return levenshtein(g, a) <= allowed;
}

export function artistsOverlap(a: string[], b: string[]): boolean {
  const na = a.flatMap(splitArtists).map(normArtist);
  const nb = new Set(b.flatMap(splitArtists).map(normArtist));
  return na.some((x) => nb.has(x));
}

/** "Calvin Harris, Rihanna" / "A feat. B" -> ["Calvin Harris", "Rihanna"] */
export function splitArtists(s: string): string[] {
  return s.split(/\s*(?:,| |;| feat\.? | ft\.? | featuring | x | & )\s*/i).filter(Boolean).concat(s);
}

const VERSION_RE = /\b(live|remix|acoustic|unplugged|demo|instrumental|karaoke|sped up|slowed|nightcore|cover)\b/i;
export function isAltVersion(title: string): boolean {
  return VERSION_RE.test(title);
}

/** Simple fuzzy score for autocomplete: all query words must prefix-match a word. */
/** Lowercase, no accents or punctuation; "&" reads as "and", "$" as "s" (Ke$ha, A$AP Rocky). */
export function searchNorm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\$/g, "s")
    .replace(/['’`.]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Letter triples of a string, for fuzzy matching. */
function triples(s: string): Set<string> {
  const out = new Set<string>();
  const p = ` ${s} `;
  for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  return out;
}

/** 0 to 1: how many letter triples two strings share. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
}

interface Hay {
  t: string;
  tw: string[];
  aw: string[];
  /** Words in brackets or after a dash: "(Pretty Young Thing)", "- Remastered". */
  xw: string[];
  /** Title and artist with the spaces taken out, both orders. */
  joined: string[];
  tri: Set<string>;
  triBoth: Set<string>;
}

const hays = new Map<string, Hay>();
function hay(title: string, artists: string[]): Hay {
  const key = `${title}\u0000${artists.join("\u0001")}`;
  let h = hays.get(key);
  if (!h) {
    const t = searchNorm(title.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s+[-–—]\s+.*$/, " ").replace(/\b(feat|ft|featuring)\b.*$/i, " ")) || searchNorm(title);
    const a = artists.map((x) => searchNorm(x).replace(/^the /, "")).join(" ");
    const tc = t.replace(/ /g, "");
    const ac = a.replace(/ /g, "");
    const full = searchNorm(title).split(" ");
    const tw = t.split(" ");
    h = { t, tw, aw: a ? a.split(" ") : [], xw: full.filter((w) => !tw.includes(w)), joined: [tc, tc + ac, ac + tc], tri: triples(tc), triBoth: triples(tc + ac) };
    if (hays.size > 30000) hays.clear();
    hays.set(key, h);
  }
  return h;
}

/** How well a typed word matches one of these words: 3 whole word, 2 start of a word, 1.5 inside one, 1 a typo or two. */
function wordMatch(w: string, words: string[]): number {
  let best = 0;
  for (const h of words) {
    if (h === w) return 3;
    if (h.startsWith(w)) best = Math.max(best, 2);
    else if (w.length >= 3 && h.includes(w)) best = Math.max(best, 1.5);
    else if (w.length >= 4 && best < 1) {
      const allowed = w.length >= 8 ? 2 : 1;
      if (levenshtein(w, h) <= allowed || levenshtein(w, h.slice(0, w.length)) <= allowed) best = 1;
    }
  }
  return best;
}

/**
 * Rank a song for what's been typed, 0 if it doesn't match. Punctuation and accents don't count,
 * words can come from the title or the artist in any order, words can be partial or a little
 * misspelt, and run-together words ("shapeofyou") work. Anything else that's close enough still
 * shows, below the real matches.
 */
export function searchRank(query: string, title: string, artists: string[]): number {
  const q = searchNorm(query);
  if (!q) return 0;
  const h = hay(title, artists);
  const qw = q.split(" ");
  let score = 0;
  let inTitle = 0;
  let matched = true;
  for (const w of qw) {
    const m = wordMatch(w, h.tw);
    if (m) {
      score += 4 * m;
      inTitle++;
      continue;
    }
    const a = Math.max(wordMatch(w, h.aw), wordMatch(w, h.xw));
    if (a) {
      score += 2 * a;
      continue;
    }
    // little words often differ ("of" for "O'", "n" for "and"): skip them at a cost
    if (w.length <= 2 && qw.length > 1) {
      score -= 3;
      continue;
    }
    matched = false;
    break;
  }
  if (matched) {
    if (h.t === q) score += 60;
    else if (h.t.startsWith(q)) score += 36;
    else if (` ${h.t}`.includes(` ${q}`)) score += 18;
    if (inTitle === qw.length) score += 8;
    // fewer unmatched title words reads as a closer match
    score -= Math.max(0, h.tw.length - inTitle) * 0.6;
    return Math.max(score, 4);
  }
  const qc = q.replace(/ /g, "");
  if (qc.length >= 3 && h.joined.some((j) => j.includes(qc))) return h.joined[0].startsWith(qc) ? 16 : 10;
  if (qc.length < 3) return 0;
  const qt = triples(qc);
  const sim = Math.max(overlap(qt, h.tri), overlap(qt, h.triBoth) * 0.9);
  return sim >= 0.34 ? sim * 4 : 0;
}

export function searchScore(query: string, title: string, artists: string[]): number {
  const q = normTitle(query);
  if (!q) return 0;
  const t = normTitle(title);
  const a = artists.map(normArtist).join(" ");
  const hay = `${t} ${a}`;
  const words = q.split(" ");
  const hayWords = hay.split(" ");
  let score = 0;
  for (const w of words) {
    if (!hayWords.some((h) => h.startsWith(w))) return 0;
    score += 1;
  }
  if (t.startsWith(q)) score += 3;
  if (t === q) score += 5;
  return score;
}

/** Words marking a version that isn't the song as people know it. */
const ALT_VERSION = /\b(instrumental|karaoke|a ?cap+el+a|remix|live|acoustic|sped up|slowed|reverb|cover|demo|orchestral|lullaby|8-bit|tribute|backing track|nightcore)\b/gi;

/**
 * True if a candidate's title/album text marks it as another version (instrumental, remix, live…)
 * than the one asked for. A word the asked-for title also has ("Despacito - Remix") is fine.
 */
export function isOtherVersion(theirs: string, asked: string): boolean {
  const want = asked.toLowerCase();
  return (theirs.match(ALT_VERSION) ?? []).some((w) => !want.includes(w.toLowerCase()));
}
