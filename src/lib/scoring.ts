import type { GameSettings } from "./types";

/** Points for solving after `listened` seconds of audio were unlocked: exponential decay from the first step. */
export function pointsFor(listened: number, s: Pick<GameSettings, "maxPoints" | "halfLife" | "steps">): number {
  const t0 = s.steps[0] ?? 0.1;
  const t = Math.max(t0, listened);
  return Math.round(s.maxPoints * Math.pow(0.5, (t - t0) / Math.max(0.05, s.halfLife)));
}

export function formatSeconds(s: number): string {
  if (s < 1) return `${+s.toFixed(2)}s`;
  return `${+s.toFixed(1)}s`;
}
