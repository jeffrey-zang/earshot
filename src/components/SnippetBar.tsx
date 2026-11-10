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

/** Places a label on the ruler: centred on its tick, except the last, which is right-aligned. */
function at(p: number, last: boolean): React.CSSProperties {
  return last ? { right: 0 } : { left: `${p * 100}%`, transform: "translateX(-50%)" };
}

/** Static scale for the scoring settings: every stop and what it's worth. */
export function ScoreScale({ settings, className }: { settings: Pick<GameSettings, "maxPoints" | "steps">; className?: string }) {
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
