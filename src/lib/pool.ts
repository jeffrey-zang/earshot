import type { ArtistRef, Filters, GameSettings, Track } from "./types";
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

export class Pool {
  /** Every track known so far (including expanded artists), for autocomplete. */
  all: Track[] = [];
  private queue: Track[] = [];
  private artistQueue: ArtistRef[] = [];
  private expanded = new Map<string, Track[]>();
  private seen = new Set<string>();
  private used = new Set<string>();
  private perArtist = new Map<string, number>();
  notes: string[] = [];

  constructor(tracks: Track[], artists: ArtistRef[], private filters: Filters, private settings: GameSettings) {
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
  }

  private add(t: Track, enqueue = true): boolean {
    const id = songId(t);
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    this.all.push(t);
    if (enqueue && checkFilters(t, this.filters) !== "no") this.queue.push(t);
    return true;
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
    if (verdict === "unknown") {
      const needYear = this.filters.yearFrom != null || this.filters.yearTo != null;
      const enriched = await enrichTrack(t, { year: needYear, genre: this.filters.genres.length > 0 });
      Object.assign(t, enriched);
      verdict = checkFilters(t, this.filters);
      // still unknown after enrichment: only accept when the unknown part is genre-free & year-free
      if (verdict === "unknown") return null;
    }
    if (verdict !== "yes") return null;
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
