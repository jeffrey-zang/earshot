"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatSeconds } from "@/lib/scoring";
import { Glyph, INK, type GlyphType } from "./notation";
import { cx } from "./ui";

/** Height of the drawing; the staff's middle line sits at MID so it lines up with a 112px Play button. */
export const TIMELINE_HEIGHT = 112;
const MID = 56;
const SP = 12.5;
const sy = (k: number) => MID + (k - 2) * SP;
const BLUE = "#1f50b0";
const HEARD = "#eab938";
const PAPER = "#e9e6dd";
const SCALE = 0.8;
const EPS = 1e-6;

/** Pitch offsets from the middle line (B4), for the Beethoven 5 motif. */
const P = { B4: 0, G4: SP, Eb4: 2 * SP, F4: 1.5 * SP, D4: 2.5 * SP, Ab4: 0.5 * SP, Eb5: -1.5 * SP, C5: -0.5 * SP };
/** Each cell: eighth rest, three eighths, then a half note. */
const MOTIF: [number, number][] = [
  [P.G4, P.Eb4],
  [P.F4, P.D4],
  [P.Ab4, P.G4],
  [P.Eb5, P.C5],
  [P.G4, P.Eb4],
  [P.F4, P.D4],
  [P.Ab4, P.G4],
  [P.C5, P.Ab4],
];

/** The first stop strictly after `v`, or null at the end. */
export function nextStop(steps: number[], v: number): number | null {
  return steps.find((s) => s > v + EPS) ?? null;
}

function prevStop(steps: number[], v: number): number {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i] < v - EPS) return steps[i];
  return steps[0];
}

const tenth = (v: number) => Math.round(v * 10) / 10;

/** Rough width of a 15px Public Sans label, for skipping labels that would collide. */
function labelWidth(text: string) {
  let w = 0;
  for (const c of text) w += c === "." ? 4.2 : c === "s" ? 7.4 : 8.8;
  return w;
}

interface Props {
  steps: number[];
  /** Playhead, in seconds. */
  value: number;
  /** Longest clip played so far. */
  heard: number;
  /** Seconds into the clip that's playing now, or null. */
  progress: number | null;
  onChange: (v: number) => void;
  valueText?: string;
  className?: string;
}

/**
 * The clip-length control: a linear staff from 0 to the last stop. Stops (settings.steps) are bar
 * lines; the playhead snaps to them when dragged near, and arrow keys move between them.
 */
export function Timeline({ steps, value, heard, progress, onChange, valueText, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(820);
  const [dragging, setDragging] = useState(false);
  const min = steps[0];
  const max = steps[steps.length - 1];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(120, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const X = (t: number) => (t / max) * w;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  function fromPointer(clientX: number, snap: number) {
    const rect = ref.current!.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = steps[0];
    for (const s of steps) if (Math.abs(X(s) - x) < Math.abs(X(best) - x)) best = s;
    if (Math.abs(X(best) - x) <= snap) return best;
    return clamp(tenth((x / w) * max));
  }

  const notes = useMemo(() => {
    const n = Math.max(2, Math.min(MOTIF.length, Math.floor(w / 100)));
    const cw = w / n;
    const out: { type: GlyphType; x: number; y: number }[] = [];
    MOTIF.slice(0, n).forEach(([a, b], i) => {
      const x0 = i * cw + cw * 0.06;
      out.push({ type: "rest8", x: x0 + 6.7, y: MID });
      out.push({ type: "three", x: x0 + 24.4, y: MID + a });
      out.push({ type: "half", x: x0 + cw * 0.72, y: MID + b });
    });
    return out;
  }, [w]);

  const labels = useMemo(() => {
    const out: { s: number; text: string; pos: "left" | "centre" | "right"; x: number }[] = [];
    let edge = Infinity;
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      const last = i === steps.length - 1;
      const text = last ? formatSeconds(s) : formatSeconds(s).replace(/s$/, "");
      const lw = labelWidth(text);
      const x = (s / max) * w;
      let left = last ? w - lw : x - lw / 2;
      const pinned = !last && left < 0;
      if (pinned) left = 0;
      if (left + lw + 6 > edge) continue;
      out.push({ s, text, pos: last ? "right" : pinned ? "left" : "centre", x });
      edge = left;
    }
    return out;
  }, [steps, max, w]);

  const hx = X(heard);
  const px = X(value);
  /** While playing: a blue cursor sweeps across and the notes it passes turn blue. */
  const gx = progress != null ? X(progress) : null;
  const top = sy(0) - 6;
  const bandH = 4 * SP + 12;

  return (
    <div className={cx("select-none", className)}>
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Clip length"
        aria-orientation="horizontal"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText ?? formatSeconds(value)}
        className={cx("group relative touch-pan-y outline-none focus-visible:outline-none", dragging ? "cursor-grabbing" : "cursor-pointer")}
        style={{ height: TIMELINE_HEIGHT }}
        onMouseDown={(e) => {
          // Keep typing focus in the answer box while dragging with a mouse.
          const a = document.activeElement as HTMLElement | null;
          if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          onChange(fromPointer(e.clientX, e.pointerType === "touch" ? 12 : 8));
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          onChange(fromPointer(e.clientX, e.pointerType === "touch" ? 12 : 8));
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          let v: number | null = null;
          const up = e.key === "ArrowRight" || e.key === "ArrowUp";
          const down = e.key === "ArrowLeft" || e.key === "ArrowDown";
          if (up) v = e.shiftKey ? tenth(value + 0.1) : (nextStop(steps, value) ?? max);
          else if (down) v = e.shiftKey ? tenth(value - 0.1) : prevStop(steps, value);
          else if (e.key === "Home") v = min;
          else if (e.key === "End") v = max;
          if (v == null) return;
          e.preventDefault();
          onChange(clamp(v));
        }}
      >
        <svg width={w} height={TIMELINE_HEIGHT} viewBox={`0 0 ${w} ${TIMELINE_HEIGHT}`} className="absolute inset-0 overflow-visible" aria-hidden>
          {hx > 0 && <rect x={0} y={top} width={hx} height={bandH} fill={HEARD} />}
          <path d={[0, 1, 2, 3, 4].map((k) => `M0 ${sy(k)} H${w}`).join(" ")} stroke={INK} strokeWidth={1.3} />
          <path
            d={steps.map((s) => `M${Math.min(w - 1.5, Math.max(1.5, X(s))).toFixed(1)} ${sy(0)} V${sy(4)}`).join(" ")}
            stroke={INK}
            strokeOpacity={0.4}
            strokeWidth={1.5}
          />
          {notes.map((n, i) => (
            <Glyph key={i} type={n.type} x={n.x} y={n.y} fill={gx != null && n.x < gx ? BLUE : INK} scale={SCALE} style={n.x < hx || (gx != null && n.x < gx) ? undefined : { opacity: 0.5 }} />
          ))}
          {gx != null && <rect x={gx - 1} y={top} width={2} height={bandH} fill={BLUE} />}
          <path d={`M${px.toFixed(1)} ${MID - 50} V${MID + 46}`} stroke={INK} strokeWidth={2.5} />
          <circle cx={px} cy={MID} r={15.5} fill="none" stroke={INK} strokeWidth={2} className="opacity-0 group-focus-visible:opacity-100" />
          <circle cx={px} cy={MID} r={10} fill={BLUE} stroke={PAPER} strokeWidth={3} />
        </svg>
      </div>
      <div className="relative -mt-1 h-5 text-[15px] leading-5 text-ink-3 tabular" aria-hidden>
        {labels.map((l) => (
          <span
            key={l.s}
            className="absolute top-0 whitespace-nowrap"
            style={l.pos === "right" ? { right: 0 } : l.pos === "left" ? { left: 0 } : { left: l.x, transform: "translateX(-50%)" }}
          >
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}
