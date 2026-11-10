import type { Filters, GameConfig, GameSettings } from "./types";

export const STEP_PRESETS: { label: string; steps: number[] }[] = [
  { label: "Classic (0.1s to 16s)", steps: [0.1, 0.5, 1, 2, 4, 8, 16] },
  { label: "Hardcore (0.1s to 2s)", steps: [0.1, 0.25, 0.5, 1, 2] },
  { label: "Relaxed (0.5s to 25s)", steps: [0.5, 1, 2, 4, 8, 15, 25] },
];

export const DEFAULT_SETTINGS: GameSettings = {
  rounds: 5,
  steps: STEP_PRESETS[0].steps,
  startMode: "beginning",
  engine: "preview",
  maxPoints: 1000,
  halfLife: 3,
  wrongPenalty: 50,
  wrongUnlocks: false,
  answerScope: "pool",
  strictArtist: true,
  tracksPerArtist: 10,
  volume: 0.8,
  mode: "classic",
  fields: ["title"],
  twist: "none",
  lyricLead: 5,
  hlMetric: "year",
  hlLives: 1,
  lastfmUser: "",
};

export const DEFAULT_FILTERS: Filters = {
  yearFrom: null,
  yearTo: null,
  genres: [],
  onlyArtists: [],
  excludeArtists: [],
  excludeExplicit: false,
  excludeVersions: true,
  maxPerArtist: 0,
  minStreams: 700,
  englishOnly: true,
};

export const DEFAULT_CONFIG: GameConfig = {
  sources: [{ kind: "catalog" }],
  filters: DEFAULT_FILTERS,
  settings: DEFAULT_SETTINGS,
};

const CONFIG_KEY = "earshot.config.v1";
const PENDING_KEY = "earshot.pending.v1";

function read<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: unknown) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/** Fill in settings added after a config was saved. */
export function normalizeConfig(saved: Partial<GameConfig>): GameConfig {
  const settings = { ...DEFAULT_SETTINGS, ...saved.settings };
  if (!Array.isArray(settings.fields) || !settings.fields.length) settings.fields = ["title"];
  return {
    sources: Array.isArray(saved.sources) ? saved.sources : DEFAULT_CONFIG.sources,
    filters: { ...DEFAULT_FILTERS, ...saved.filters },
    settings,
    category: typeof saved.category === "string" ? saved.category : undefined,
  };
}

const LOOP_V2_KEY = "earshot.loop.v2";
const SCORING_V3_KEY = "earshot.scoring.v3";

export function loadConfig(): GameConfig {
  const saved = read<GameConfig>(() => localStorage, CONFIG_KEY);
  if (!saved) return DEFAULT_CONFIG;
  const config = normalizeConfig(saved);
  // The free-length timeline made "wrong guesses unlock the next snippet" opt-in; switch saved configs over once.
  if (!read<boolean>(() => localStorage, LOOP_V2_KEY)) {
    config.settings = { ...config.settings, wrongUnlocks: false };
    write(() => localStorage, LOOP_V2_KEY, true);
    saveConfig(config);
  }
  // Songless-style defaults: a wrong guess costs 50, and answers come from the game's own songs.
  if (!read<boolean>(() => localStorage, SCORING_V3_KEY)) {
    const st = config.settings;
    config.settings = { ...st, wrongPenalty: st.wrongPenalty === 100 ? 50 : st.wrongPenalty, answerScope: "pool" };
    write(() => localStorage, SCORING_V3_KEY, true);
    saveConfig(config);
  }
  return config;
}

export function saveConfig(config: GameConfig) {
  write(() => localStorage, CONFIG_KEY, config);
}

/** The config the /play page should start with. */
export function setPendingGame(config: GameConfig) {
  write(() => sessionStorage, PENDING_KEY, config);
  saveConfig(config);
}

const BEST_KEY = "earshot.best.v1";

/** Best score per game (see GameConfig.category). */
export function bestScores(): Record<string, number> {
  return read<Record<string, number>>(() => localStorage, BEST_KEY) ?? {};
}

/** Record a finished game. Returns the best before this one, or null if there was none. */
export function recordScore(category: string, score: number): number | null {
  const all = bestScores();
  const before = category in all ? all[category] : null;
  if (before == null || score > before) write(() => localStorage, BEST_KEY, { ...all, [category]: score });
  return before;
}

export function getPendingGame(): GameConfig | null {
  const saved = read<GameConfig>(() => sessionStorage, PENDING_KEY);
  return saved ? normalizeConfig(saved) : null;
}
