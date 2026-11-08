"use client";

import { formatSeconds } from "@/lib/scoring";
import { cx } from "./ui";

/** Log-scaled timeline of snippet lengths, so 0.1s is still visible next to 16s. */
export function SnippetBar({ steps, unlocked, elapsed }: { steps: number[]; unlocked: number; elapsed: number | null }) {
  const t0 = steps[0] / 2;
  const tmax = steps[steps.length - 1];
  const pos = (t: number) => Math.max(0, Math.min(1, Math.log(Math.max(t, t0) / t0) / Math.log(tmax / t0)));
  const unlockedPos = pos(steps[unlocked]);
  return (
    <div className="select-none">
      <div className="relative h-3 overflow-hidden rounded-full bg-panel2 ring-1 ring-line">
        <div className="absolute inset-y-0 left-0 bg-accent/25 transition-[width] duration-300" style={{ width: `${unlockedPos * 100}%` }} />
        {elapsed != null && <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pos(elapsed) * 100}%` }} />}
        {steps.slice(0, -1).map((s) => (
          <div key={s} className="absolute inset-y-0 w-px bg-ink/70" style={{ left: `${pos(s) * 100}%` }} />
        ))}
      </div>
      <div className="relative mt-2 h-4 text-[11px] tabular">
        {steps.map((s, i) => (
          <span
            key={s}
            className={cx("absolute -translate-x-full whitespace-nowrap pr-0.5", i <= unlocked ? "text-accent2" : "text-faint", i === steps.length - 1 && "pr-0")}
            style={{ left: `${pos(s) * 100}%` }}
          >
            {formatSeconds(s)}
          </span>
        ))}
      </div>
    </div>
  );
}
