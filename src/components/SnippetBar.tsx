"use client";

import type { GameSettings } from "@/lib/types";
import { formatSeconds, pointsFor } from "@/lib/scoring";
import { cx } from "./ui";

/** Log scale, so 0.1s is still visible next to 16s. */
function scale(steps: number[]) {
  const t0 = steps[0] / 2;
  const tmax = steps[steps.length - 1];
  return (t: number) => Math.max(0, Math.min(1, Math.log(Math.max(t, t0) / t0) / Math.log(tmax / t0)));
}

const short = (s: number) => formatSeconds(s).replace(/s$/, "");

/** Places a label on the ruler: centred on its tick, except the last, which is right-aligned. */
function at(p: number, last: boolean): React.CSSProperties {
  return last ? { right: 0 } : { left: `${p * 100}%`, transform: "translateX(-50%)" };
}

/**
 * The snippet ruler, the core visual of the game.
 * Ticks mark each snippet length; the ink span is what's unlocked; cobalt tracks live playback.
 */
export function SnippetBar({ steps, unlocked, elapsed, settings }: { steps: number[]; unlocked: number; elapsed: number | null; settings?: Pick<GameSettings, "maxPoints" | "halfLife" | "steps"> }) {
  const pos = scale(steps);
  const last = steps.length - 1;
  const dense = steps.length > 9;
  const showLabel = (i: number) => !dense || i === 0 || i === unlocked || i === last;
  return (
    <div className="select-none tabular" aria-hidden>
      {settings && (
        <div className="relative mb-1 h-4 text-[12px] condensed">
          {steps.map((s, i) =>
            showLabel(i) ? (
              <span key={s} className={cx("absolute whitespace-nowrap", i === unlocked ? "font-bold text-ink" : i < unlocked ? "text-ink-3 line-through" : "text-ink-3")} style={at(pos(s), i === last)}>
                {pointsFor(s, settings)}
              </span>
            ) : null,
          )}
        </div>
      )}
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-[9px] h-0.5 bg-rule" />
        <div className="absolute left-0 top-2 h-1 bg-ink transition-[width] duration-300 ease-[var(--ease-out)]" style={{ width: `${pos(steps[unlocked]) * 100}%` }} />
        {elapsed != null && <div className="absolute left-0 top-2 h-1 bg-signal" style={{ width: `${pos(elapsed) * 100}%` }} />}
        {steps.map((s, i) => (
          <div
            key={s}
            className={cx("absolute", i <= unlocked ? "top-0.5 h-4 w-0.5 bg-ink" : "top-[5px] h-2.5 w-px bg-tick")}
            style={i === last ? { right: 0 } : { left: `${pos(s) * 100}%` }}
          />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[12px] font-semibold condensed">
        {steps.map((s, i) =>
          showLabel(i) ? (
            <span key={s} className={cx("absolute whitespace-nowrap", i <= unlocked ? "text-ink" : "text-ink-3")} style={at(pos(s), i === last)}>
              {i === last ? formatSeconds(s) : short(s)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** Large, static version for the home page and scoring settings: every length and what it's worth. */
export function ScoreScale({ settings, className }: { settings: Pick<GameSettings, "maxPoints" | "halfLife" | "steps">; className?: string }) {
  const steps = settings.steps;
  const pos = scale(steps);
  const last = steps.length - 1;
  return (
    <figure className={className}>
      <div className="relative h-7" aria-hidden>
        <div className="absolute inset-x-0 top-[13px] h-0.5 bg-ink" />
        {steps.map((s, i) => (
          <div key={s} className={cx("absolute w-0.5 bg-ink", i === 0 || i === last ? "top-0.5 h-6" : "top-1.5 h-4")} style={i === last ? { right: 0 } : { left: `${pos(s) * 100}%` }} />
        ))}
      </div>
      <ol className="relative mt-1 h-12 tabular">
        {steps.map((s, i) => (
          <li key={s} className={cx("absolute", i === last ? "text-right" : "text-center")} style={at(pos(s), i === last)}>
            <span className="block text-lg font-bold leading-tight condensed sm:text-xl">{formatSeconds(s)}</span>
            <span className="block text-[13px] text-ink-2">{pointsFor(s, settings)}</span>
          </li>
        ))}
      </ol>
      <figcaption className="sr-only">Points for a correct guess at each snippet length.</figcaption>
    </figure>
  );
}
