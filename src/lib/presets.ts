import type { GameConfig, GameSettings, SourceSpec } from "./types";
import { DEFAULT_FILTERS, DEFAULT_SETTINGS, loadConfig, setPendingGame } from "./settings";
import { beginLogin, getClientId, isConnected } from "./spotify/auth";

/** Ready-made games: the home Play button (Quick five) and everything on Explore. */

export type PresetGroup = "hits" | "games" | "spotify";
export type PresetIcon = "play" | "history" | "trending" | "list" | "calendar" | "rewind" | "quote" | "updown" | "heart" | "star" | "user";

export interface Preset {
  /** URL-safe id, e.g. "before-2000". */
  id: string;
  title: string;
  group: PresetGroup;
  icon: PresetIcon;
  /** Needs a Spotify login. */
  spotify?: boolean;
  apply: (c: GameConfig) => GameConfig;
}

export const CLASSIC: Partial<GameSettings> = { mode: "classic", fields: ["title"], twist: "none" };

/** Ready-made games always use the standard clip stops and scoring, whatever was set for custom games. */
const STANDARD: Partial<GameSettings> = (({ steps, startMode, maxPoints, wrongPenalty, wrongUnlocks, answerScope, strictArtist, engine }) => ({ steps, startMode, maxPoints, wrongPenalty, wrongUnlocks, answerScope, strictArtist, engine }))(DEFAULT_SETTINGS);

export const only =
  (sources: SourceSpec[], rounds: number, filters: Partial<GameConfig["filters"]> = {}, patch: Partial<GameSettings> = {}) =>
  (c: GameConfig): GameConfig => ({
    sources,
    filters: { ...DEFAULT_FILTERS, ...filters },
    settings: { ...c.settings, ...STANDARD, ...CLASSIC, ...patch, rounds },
  });

export const CATALOG: SourceSpec[] = [{ kind: "catalog" }];

/** The home Play button: five hits (700M+ streams, 1980 on), getting less familiar as the run goes. */
export const QUICK_FIVE: Preset = { id: "quick-five", title: "Quick five", group: "hits", icon: "play", apply: only(CATALOG, 5) };

/** Everything on Explore, in display order. */
export const PRESETS: Preset[] = [
  { id: "global-top-100", title: "Global top 100", group: "hits", icon: "trending", apply: only([{ kind: "deezer-chart" }], 5) },
  { id: "2020s", title: "2020s", group: "hits", icon: "star", apply: only(CATALOG, 5, { yearFrom: 2020 }) },
  { id: "2010s", title: "2010s", group: "hits", icon: "calendar", apply: only(CATALOG, 5, { yearFrom: 2010, yearTo: 2019 }) },
  { id: "song-artist-year", title: "Song, artist and year", group: "hits", icon: "list", apply: only(CATALOG, 5, {}, { fields: ["title", "artist", "year"] }) },
  { id: "guess-the-year", title: "Guess the year", group: "hits", icon: "calendar", apply: only(CATALOG, 10, {}, { fields: ["year"] }) },
  { id: "backwards", title: "Backwards", group: "hits", icon: "rewind", apply: only(CATALOG, 5, {}, { twist: "reverse", steps: [0.5, 1, 2, 4, 8, 16] }) },
  { id: "before-2000", title: "Before 2000", group: "hits", icon: "history", apply: only(CATALOG, 10, { yearTo: 1999 }) },
  { id: "finish-the-lyric", title: "Finish the lyric", group: "games", icon: "quote", apply: only(CATALOG, 5, {}, { mode: "lyrics" }) },
  { id: "higher-or-lower", title: "Higher or lower", group: "games", icon: "updown", apply: only(CATALOG, 0, {}, { mode: "higherlower", hlMetric: "year", hlLives: 1 }) },
  { id: "liked-songs", title: "Liked Songs", group: "spotify", icon: "heart", spotify: true, apply: only([{ kind: "spotify-liked" }], 5) },
  {
    id: "top-tracks",
    title: "Your top tracks",
    group: "spotify",
    icon: "star",
    spotify: true,
    apply: only([{ kind: "spotify-top", range: "short_term" }, { kind: "spotify-top", range: "medium_term" }, { kind: "spotify-recent" }], 10),
  },
  { id: "liked-before-1999", title: "Liked before 1999", group: "spotify", icon: "history", spotify: true, apply: only([{ kind: "spotify-liked" }], 5, { yearTo: 1998 }) },
  { id: "when-you-liked-it", title: "When you liked it", group: "spotify", icon: "calendar", spotify: true, apply: only([{ kind: "spotify-liked" }], 10, {}, { fields: ["title", "added"] }) },
  { id: "which-you-liked-first", title: "Which you liked first", group: "spotify", icon: "updown", spotify: true, apply: only([{ kind: "spotify-liked" }], 0, {}, { mode: "higherlower", hlMetric: "added", hlLives: 3 }) },
  { id: "every-artist", title: "Every artist you follow", group: "spotify", icon: "user", spotify: true, apply: only([{ kind: "spotify-followed-artists" }], 50, { maxPerArtist: 2 }) },
];

export const GROUPS: { id: PresetGroup; label: string }[] = [
  { id: "hits", label: "Hits" },
  { id: "games", label: "Other games" },
  { id: "spotify", label: "Your Spotify" },
];

/** The five shown along the bottom of the home page. */
export const HOME_PICKS: string[] = ["global-top-100", "2020s", "finish-the-lyric", "higher-or-lower", "backwards"];

export function presetById(id: string): Preset | undefined {
  return id === QUICK_FIVE.id ? QUICK_FIVE : PRESETS.find((p) => p.id === id);
}

/** Quick five on top of the saved settings. */
export function quickFive(config: GameConfig): GameConfig {
  return { ...QUICK_FIVE.apply(config), category: QUICK_FIVE.id };
}

/** Hand a game to /play. Returns the path to navigate to. */
export function launch(config: GameConfig): string {
  setPendingGame(config);
  return "/play";
}

/**
 * Start a preset. Spotify presets need a login first: with a client ID that's Spotify's
 * login (Explore starts the game on return); without one, /custom, where links can be pasted.
 */
export function startPreset(preset: Preset, go: (href: string) => void) {
  if (preset.spotify && !isConnected()) {
    if (getClientId()) beginLogin({ returnTo: `/explore?start=${preset.id}` }).catch(() => go("/custom"));
    else go("/custom");
    return;
  }
  go(launch({ ...preset.apply(loadConfig()), category: preset.id }));
}
