import type { ArtistRef, Filters, GameSettings, Track } from "./types";
type Needs = { year: boolean; album: boolean; added: boolean; playlist: boolean };
import { artistsOverlap, isAltVersion, normArtist, normTitle } from "./text";
import { enrichTrack } from "./enrich";
import { expandArtist } from "./sources";
import { shuffle } from "./random";

type Verdict = "yes" | "no" | "unknown";

export function songId(t: Track): string {
  return `${normTitle(t.title)}|${normArtist(t.artists[0] ?? "")}`;
}

function effectiveYear(t: Track): number | undefined {
  return t.year ?? t.fallbackYear;
}

/** Check a track against the filters using only what we already know about it. */
export function checkFilters(t: Track, f: Filters): Verdict {
  if (f.excludeExplicit && t.explicit) return "no";
  if (f.minStreams && t.streams != null && t.streams < f.minStreams) return "no";
  if (f.englishOnly && t.foreign) return "no";
  if (f.excludeVersions && isAltVersion(t.title)) return "no";
  if (f.onlyArtists.length && !artistsOverlap(t.artists, f.onlyArtists)) return "no";
  if (f.excludeArtists.length && artistsOverlap(t.artists, f.excludeArtists)) return "no";
  let unknown = false;
  if (f.yearFrom != null || f.yearTo != null) {
    const from = f.yearFrom ?? -Infinity;
    const to = f.yearTo ?? Infinity;
    const y = effectiveYear(t);
    if (y) {
      if (y < from || y > to) return "no";
    } else if (t.decade) {
      if (t.decade + 9 < from || t.decade > to) return "no";
      // a decade that straddles the range boundary is ambiguous
      if (t.decade < from || t.decade + 9 > to) unknown = true;
    } else unknown = true;
  }
  if (f.genres.length) {
    if (t.genres?.length) {
      if (!t.genres.some((g) => f.genres.includes(g))) return "no";
    } else unknown = true;
  }
  return unknown ? "unknown" : "yes";
}

/** Data a round needs beyond the filters, given the mode. */
export function modeNeeds(s: GameSettings): Needs {
  if (s.mode === "higherlower") return { year: s.hlMetric === "year", album: false, added: s.hlMetric === "added", playlist: false };
  if (s.mode === "lyrics") return { year: false, album: false, added: false, playlist: false };
  return { year: s.fields.includes("year"), album: s.fields.includes("album"), added: s.fields.includes("added"), playlist: s.fields.includes("playlist") };
}

/** A slight lean toward newer songs, and toward pop, then R&B, then hip-hop and dance. */
const GENRE_LEAN: Partial<Record<string, number>> = { pop: 1.35, rnb: 1.2, hiphop: 1.1, dance: 1.1 };
function lean(t: Track): number {
  const year = t.year ?? t.decade ?? 2000;
  const recent = 1 + 0.45 * Math.min(1, Math.max(0, (year - 1980) / 45));
  const genre = Math.max(1, ...(t.genres ?? []).map((g) => GENRE_LEAN[g] ?? 1));
  return recent * genre;
}

/** Random order, weighted by lean(): the next pop() is most likely a favoured song. */
function leanShuffle(list: Track[]): Track[] {
  return list
    .map((t) => ({ t, k: Math.pow(Math.random(), 1 / lean(t)) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.t);
}

/** A run moves through these stages, from the most streamed songs to the least (as in Songless). */
export const STAGE_NAMES = ["Easy", "Medium", "Hard", "Expert", "Brutal"] as const;
const STAGES = STAGE_NAMES.length;

export class Pool {
  /** Every track known so far that can come up in this game (including expanded artists), for autocomplete. */
  all: Track[] = [];
  private byId = new Map<string, Track>();
  private needs: Needs;
  private queue: Track[] = [];
  private artistQueue: ArtistRef[] = [];
  private expanded = new Map<string, Track[]>();
  private seen = new Set<string>();
  private used = new Set<string>();
  private perArtist = new Map<string, number>();
  /** Songs split by stream count, most streamed first, when the whole pool has stream counts. */
  private tiers: Track[][] | null = null;
  private picked = 0;
  notes: string[] = [];

  constructor(tracks: Track[], artists: ArtistRef[], private filters: Filters, private settings: GameSettings) {
    this.needs = modeNeeds(settings);
    for (const t of tracks) this.add(t);
    const seenArtists = new Set<string>();
    this.artistQueue = shuffle(artists.filter((a) => {
      const k = normArtist(a.name);
      if (seenArtists.has(k)) return false;
      seenArtists.add(k);
      if (filters.excludeArtists.length && artistsOverlap([a.name], filters.excludeArtists)) return false;
      if (filters.onlyArtists.length && !artistsOverlap([a.name], filters.onlyArtists)) return false;
      return true;
    }));
    this.queue = shuffle(this.queue);
    // Runs of a set length get harder as they go: each stage draws from a less streamed slice of the pool.
    const ranked = this.queue.filter((t) => t.streams);
    if (settings.rounds > 0 && !this.artistQueue.length && ranked.length >= STAGES * 2 && ranked.length >= this.queue.length * 0.9) {
      const sorted = [...this.queue].sort((x, y) => (y.streams ?? 0) - (x.streams ?? 0));
      const per = Math.ceil(sorted.length / STAGES);
      this.tiers = Array.from({ length: STAGES }, (_, i) => leanShuffle(sorted.slice(i * per, (i + 1) * per)));
    }
  }

  /** The next song from a stage, or the nearest stage that still has songs. */
  private fromTier(stage: number): Track | undefined {
    const tiers = this.tiers!;
    for (let d = 0; d < STAGES; d++) {
      for (const i of d ? [stage + d, stage - d] : [stage]) {
        const t = tiers[i]?.pop();
        if (t) {
          t.stage = stage;
          return t;
        }
      }
    }
    return undefined;
  }

  private add(t: Track, enqueue = true): boolean {
    const id = songId(t);
    const existing = this.byId.get(id);
    if (existing) {
      // same song from another source: keep what each source knows
      if (t.playlists?.length) existing.playlists = [...new Set([...(existing.playlists ?? []), ...t.playlists])];
      if (t.addedAt && (!existing.addedAt || t.addedAt < existing.addedAt)) existing.addedAt = t.addedAt;
      if (t.album && !existing.album) existing.album = t.album;
      if (enqueue && !this.queue.includes(existing) && !this.used.has(id) && checkFilters(existing, this.filters) !== "no") this.queue.push(existing);
      return false;
    }
    this.seen.add(id);
    this.byId.set(id, t);
    const fits = checkFilters(t, this.filters) !== "no";
    if (fits) this.all.push(t);
    if (enqueue && fits) this.queue.push(t);
    return true;
  }

  /** Whether the track has the data this mode needs: yes / no / unknown (look it up). */
  private checkNeeds(t: Track): "yes" | "no" | "unknown" {
    const n = this.needs;
    if (n.added && !t.addedAt) return "no";
    if (n.playlist && !t.playlists?.length) return "no";
    if ((n.year && !t.year) || (n.album && !t.album)) return t.enriched ? "no" : "unknown";
    return "yes";
  }

  /** Songs known to match (plus ones we can't rule out yet). */
  get candidateCount(): number {
    return this.queue.length;
  }

  get artistCount(): number {
    return this.artistQueue.length;
  }

  /** Rough number of rounds available, for "play every song" mode. */
  get estimatedSize(): number {
    return this.queue.length + this.artistQueue.length * this.settings.tracksPerArtist;
  }

  private artistAllowed(t: Track): boolean {
    if (!this.filters.maxPerArtist) return true;
    return (this.perArtist.get(normArtist(t.artists[0] ?? "")) ?? 0) < this.filters.maxPerArtist;
  }

  private markUsed(t: Track) {
    this.used.add(songId(t));
    const a = normArtist(t.artists[0] ?? "");
    this.perArtist.set(a, (this.perArtist.get(a) ?? 0) + 1);
  }

  private async accept(t: Track): Promise<Track | null> {
    if (this.used.has(songId(t)) || !this.artistAllowed(t)) return null;
    let verdict = checkFilters(t, this.filters);
    let needs = this.checkNeeds(t);
    if (verdict === "no" || needs === "no") return null;
    if (verdict === "unknown" || needs === "unknown") {
      const needYear = this.filters.yearFrom != null || this.filters.yearTo != null || this.needs.year;
      const enriched = await enrichTrack(t, { year: needYear, genre: this.filters.genres.length > 0, album: this.needs.album });
      Object.assign(t, enriched);
      verdict = checkFilters(t, this.filters);
      needs = this.checkNeeds(t);
      // still unknown after enrichment: skip it
      if (verdict !== "yes" || needs !== "yes") return null;
    }
    this.markUsed(t);
    return t;
  }

  private async fromArtist(): Promise<Track | null> {
    while (this.artistQueue.length) {
      const a = this.artistQueue[0];
      let list = this.expanded.get(a.key);
      if (!list) {
        list = shuffle(await expandArtist(a, this.settings.tracksPerArtist).catch(() => [] as Track[]));
        for (const t of list) this.add(t, false);
        this.expanded.set(a.key, list);
      }
      while (list.length) {
        const t = list.shift()!;
        const ok = await this.accept(t);
        if (ok) {
          // rotate so the next artist pick is a different artist
          this.artistQueue.push(this.artistQueue.shift()!);
          return ok;
        }
      }
      this.artistQueue.shift();
    }
    return null;
  }

  /** Pick the next song that passes every filter. Returns null when the pool is exhausted. */
  async next(maxChecks = 60): Promise<Track | null> {
    let checks = 0;
    if (this.tiers) {
      while (checks++ < maxChecks) {
        const stage = Math.min(STAGES - 1, Math.floor((this.picked * STAGES) / Math.max(1, this.settings.rounds)));
        const t = this.fromTier(stage);
        if (!t) return null;
        const ok = await this.accept(t);
        if (ok) {
          this.picked++;
          return ok;
        }
      }
      return null;
    }
    while (checks < maxChecks && (this.queue.length || this.artistQueue.length)) {
      checks++;
      const artistWeight = this.artistQueue.length * this.settings.tracksPerArtist;
      const useArtist = this.artistQueue.length > 0 && Math.random() < artistWeight / (artistWeight + this.queue.length);
      if (useArtist) {
        const t = await this.fromArtist();
        if (t) return t;
        continue;
      }
      const t = this.queue.pop();
      if (!t) continue;
      const ok = await this.accept(t);
      if (ok) return ok;
    }
    return null;
  }
}
