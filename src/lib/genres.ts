import type { GenreCode } from "./types";

export const GENRES: { code: GenreCode; label: string }[] = [
  { code: "pop", label: "Pop" },
  { code: "rock", label: "Rock" },
  { code: "hiphop", label: "Hip-Hop" },
  { code: "rnb", label: "R&B" },
  { code: "dance", label: "Dance & Electronic" },
  { code: "indie", label: "Indie & Alternative" },
  { code: "country", label: "Country" },
  { code: "latin", label: "Latin" },
  { code: "kpop", label: "K-Pop & Asian" },
  { code: "jazz", label: "Jazz" },
  { code: "classical", label: "Classical" },
  { code: "metal", label: "Metal" },
  { code: "soul", label: "Soul & Funk" },
  { code: "reggae", label: "Reggae" },
  { code: "folk", label: "Folk" },
  { code: "blues", label: "Blues" },
  { code: "soundtrack", label: "Soundtrack" },
];

export const GENRE_LABEL = Object.fromEntries(GENRES.map((g) => [g.code, g.label])) as Record<GenreCode, string>;

const RULES: [RegExp, GenreCode][] = [
  [/k-?pop|j-?pop|c-?pop|mandopop|cantopop|asian|anime|j-?rock/i, "kpop"],
  [/hip ?hop|rap|trap|drill|grime/i, "hiphop"],
  [/r&b|r ?n ?b|rhythm and blues|urban contemporary/i, "rnb"],
  [/metal|metalcore|hardcore|grindcore/i, "metal"],
  [/indie|alternative|alt-|shoegaze|emo|post-punk|new wave|grunge/i, "indie"],
  [/punk|rock|britpop/i, "rock"],
  [/house|techno|edm|electro|dance|trance|dubstep|drum and bass|disco|electronic|eurodance|synth/i, "dance"],
  [/country|americana|bluegrass/i, "country"],
  [/latin|reggaeton|salsa|bachata|cumbia|mexican|urbano|brazil|sertanejo|funk carioca|bossa/i, "latin"],
  [/jazz|swing|bebop/i, "jazz"],
  [/classical|orchestra|baroque|opera|romantic era|symphony|composer|piano/i, "classical"],
  [/soul|funk|motown|gospel/i, "soul"],
  [/reggae|dancehall|ska|dub/i, "reggae"],
  [/folk|singer-songwriter|acoustic/i, "folk"],
  [/blues/i, "blues"],
  [/soundtrack|film|movie|score|musical|games|video game|show tunes/i, "soundtrack"],
  [/pop|adult contemporary|vocal/i, "pop"],
];

/** Map free-form genre names (iTunes, Deezer, Spotify artist genres) to our buckets. */
export function mapGenres(names: string[]): GenreCode[] {
  const out = new Set<GenreCode>();
  for (const name of names) {
    for (const [re, code] of RULES) {
      if (re.test(name)) {
        out.add(code);
        break;
      }
    }
  }
  return [...out];
}
