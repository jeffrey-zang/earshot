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
