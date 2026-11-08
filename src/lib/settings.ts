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
  wrongPenalty: 100,
  wrongUnlocks: true,
  answerScope: "any",
  strictArtist: true,
  tracksPerArtist: 10,
  volume: 0.8,
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

export function loadConfig(): GameConfig {
  const saved = read<GameConfig>(() => localStorage, CONFIG_KEY);
  if (!saved) return DEFAULT_CONFIG;
  return {
    sources: Array.isArray(saved.sources) ? saved.sources : DEFAULT_CONFIG.sources,
    filters: { ...DEFAULT_FILTERS, ...saved.filters },
    settings: { ...DEFAULT_SETTINGS, ...saved.settings },
  };
}

export function saveConfig(config: GameConfig) {
  write(() => localStorage, CONFIG_KEY, config);
}

/** The config the /play page should start with. */
export function setPendingGame(config: GameConfig) {
  write(() => sessionStorage, PENDING_KEY, config);
  saveConfig(config);
}

export function getPendingGame(): GameConfig | null {
  return read<GameConfig>(() => sessionStorage, PENDING_KEY);
}
