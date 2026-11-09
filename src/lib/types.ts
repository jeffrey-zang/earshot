export type GenreCode =
  | "pop" | "rock" | "hiphop" | "rnb" | "dance" | "indie" | "country" | "latin" | "kpop"
  | "jazz" | "classical" | "metal" | "soul" | "reggae" | "folk" | "blues" | "soundtrack";

export interface Track {
  /** Stable unique key, e.g. "sp:4u7EnebtmKWzUH433cf5Qv" or "dz:3135556". */
  key: string;
  title: string;
  artists: string[];
  album?: string;
  year?: number;
  /** Decade hint when the exact year is unknown (e.g. 1980). */
  decade?: number;
  /** Year from a less reliable source (e.g. a reissue date), used only when nothing better is known. */
  fallbackYear?: number;
  genres?: GenreCode[];
  durationMs?: number;
  explicit?: boolean;
  image?: string;
  spotifyId?: string;
  deezerId?: number;
  /** A preview URL that does not expire (Spotify / iTunes). */
  previewUrl?: string;
  /** Where the track came from, for display. */
  sourceLabel?: string;
  /** Set once enrichment was attempted so we don't retry. */
  enriched?: boolean;
  /** Other accepted album titles (original album, reissues, compilations). */
  albums?: string[];
  /** When the user saved it (liked, added to a playlist, saved the album). ISO date. */
  addedAt?: string;
  /** Names of the playlists in this game that contain the song. */
  playlists?: string[];
  /** Deezer popularity rank (higher is more popular). */
  rank?: number;
  /** Last.fm play counts, fetched when a mode needs them. */
  lastfm?: { playcount: number; listeners: number; userplaycount?: number };
  /** Lyrics lines, fetched when a mode needs them. `time` is seconds into the full track. */
  lyrics?: { lines: { time: number | null; text: string }[]; synced: boolean };
}

/** A lazily expanded artist: their tracks are fetched only when the game samples them. */
export interface ArtistRef {
  key: string;
  name: string;
  spotifyId?: string;
  deezerId?: number;
  sourceLabel?: string;
}

export type SpotifyLinkType = "playlist" | "album" | "artist" | "track";
export type TimeRange = "short_term" | "medium_term" | "long_term";

export type SourceSpec =
  | { kind: "catalog" }
  | { kind: "deezer-chart" }
  | { kind: "deezer-artist"; id: number; name: string }
  | { kind: "deezer-playlist"; id: number; name: string }
  | { kind: "deezer-album"; id: number; name: string }
  | { kind: "spotify-link"; type: SpotifyLinkType; id: string; name: string }
  | { kind: "spotify-liked" }
  | { kind: "spotify-top"; range: TimeRange }
  | { kind: "spotify-recent" }
  | { kind: "spotify-playlist"; id: string; name: string }
  | { kind: "spotify-saved-albums" }
  | { kind: "spotify-followed-artists" }
  | { kind: "spotify-top-artists"; range: TimeRange };

export type StartMode = "beginning" | "middle" | "random";
export type Engine = "preview" | "spotify";

/** What kind of game: name things from a snippet, finish a lyric, or compare two songs. */
export type GameMode = "classic" | "lyrics" | "higherlower";
/** What a classic round asks for. Several can be combined. */
export type AnswerField = "title" | "artist" | "album" | "year" | "plays" | "myplays" | "added" | "playlist";
/** Audio effects that make snippets harder (previews only). */
export type Twist = "none" | "reverse" | "fast" | "slow" | "muffled" | "random";
/** What higher-or-lower compares. */
export type HLMetric = "year" | "popularity" | "plays" | "added";

export interface GameSettings {
  /** Number of rounds; 0 means "every song in the pool". */
  rounds: number;
  /** Unlockable snippet lengths in seconds, ascending. */
  steps: number[];
  startMode: StartMode;
  engine: Engine;
  maxPoints: number;
  /** Points halve every `halfLife` seconds of audio unlocked. */
  halfLife: number;
  wrongPenalty: number;
  wrongUnlocks: boolean;
  /** Autocomplete from the pool only, or any song. */
  answerScope: "pool" | "any";
  /** Picking a suggestion by the wrong artist counts as wrong. */
  strictArtist: boolean;
  /** Tracks per artist when an artist source is sampled. */
  tracksPerArtist: number;
  volume: number;
  mode: GameMode;
  fields: AnswerField[];
  twist: Twist;
  /** Lyrics mode: seconds of audio before the missing line (full tracks only). */
  lyricLead: number;
  hlMetric: HLMetric;
  /** Higher-or-lower: mistakes allowed before the run ends. */
  hlLives: number;
  /** Last.fm username, for "your plays". */
  lastfmUser: string;
}

export interface Filters {
  yearFrom: number | null;
  yearTo: number | null;
  genres: GenreCode[];
  onlyArtists: string[];
  excludeArtists: string[];
  excludeExplicit: boolean;
  excludeVersions: boolean;
  maxPerArtist: number;
}

export interface GameConfig {
  sources: SourceSpec[];
  filters: Filters;
  settings: GameSettings;
}

export interface Guess {
  text: string;
  artist?: string;
  correct: boolean;
  skipped?: boolean;
  /** Seconds unlocked when the guess was made. */
  at: number;
}

export interface FieldResult {
  field: AnswerField;
  /** right: exact; close: partial credit; wrong: no credit. */
  outcome: "right" | "close" | "wrong";
  points: number;
  guess?: string;
  answer: string;
  /** e.g. "off by 2 years" */
  detail?: string;
  /** Seconds of audio unlocked when answered. */
  at?: number;
}

export interface RoundResult {
  track: Track;
  guesses: Guess[];
  solved: boolean;
  /** Seconds of audio unlocked when solved (or the max). */
  listened: number;
  points: number;
  fields?: FieldResult[];
  /** Lyrics mode */
  lyric?: { line: string; guess: string; similarity: number; hints: number };
  /** Higher-or-lower: the song this one was compared against. */
  versus?: { track: Track; metric: HLMetric; choice: "higher" | "lower"; correct: boolean; a: number; b: number };
  twist?: Twist;
}
