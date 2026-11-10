import type { GameSettings } from "./types";

/** Share of the top score that's still worth it at the last stop (the whole clip). */
export const FLOOR_SHARE = 0.35;
/** Shape of the drop, fitted to Songless: steep in the first second, then gentle. */
const CURVE = 1.55;

/**
 * Points for solving after `listened` seconds of audio were unlocked. Full points at the first
 * stop, falling to 35% at the last one (1000 at 0.1s, about 600 at 1s, 350 at 16s by default).
 */
export function pointsFor(listened: number, s: Pick<GameSettings, "maxPoints" | "steps">): number {
  const first = s.steps[0] ?? 0.1;
  const last = Math.max(first, s.steps[s.steps.length - 1] ?? 16);
  const t = Math.min(last, Math.max(first, listened));
  const left = last > first ? Math.log(last / t) / Math.log(last / first) : 1;
  return Math.round(s.maxPoints * (FLOOR_SHARE + (1 - FLOOR_SHARE) * Math.pow(left, CURVE)));
}

/** What an answer earns after wrong guesses: never below zero. */
export function netPoints(points: number, penalty: number): number {
  return Math.max(0, points - penalty);
}

export function formatSeconds(s: number): string {
  if (s < 1) return `${+s.toFixed(2)}s`;
  return `${+s.toFixed(1)}s`;
}
