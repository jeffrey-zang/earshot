"use client";

import { useEffect, useRef, useState } from "react";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** A number that rolls to each new value instead of jumping. `from` sets where it starts on mount. */
export function useRolling(value: number, { duration = 420, delay = 0, from }: { duration?: number; delay?: number; from?: number } = {}): number {
  const [shown, setShown] = useState(from ?? value);
  const current = useRef(from ?? value);
  useEffect(() => {
    if (reducedMotion() || current.current === value) {
      current.current = value;
      setShown(value);
      return;
    }
    const start = current.current;
    let raf = 0;
    let t0 = 0;
    const step = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / duration);
      const v = Math.round(start + (value - start) * (1 - Math.pow(1 - p, 3)));
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => (raf = requestAnimationFrame(step)), delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [value, duration, delay]);
  return shown;
}

/**
 * Rolls to each new value and gives it a small bump when it changes. The text is the final value
 * for screen readers; the rolling digits are hidden from them.
 */
export function Rolling({ value, format = (n) => n.toLocaleString(), duration, delay, from, bump = "animate-bump", className }: { value: number; format?: (n: number) => string; duration?: number; delay?: number; from?: number; bump?: string; className?: string }) {
  const shown = useRolling(value, { duration, delay, from });
  const first = useRef(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTick((n) => n + 1);
  }, [value]);
  return (
    <span className={className}>
      <span key={tick} className={tick ? `inline-block ${bump}` : "inline-block"} aria-hidden>
        {format(shown)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** Full height of the visible page with no keyboard up (iOS 26 shrinks innerHeight with the keyboard). */
let fullHeight = 0;
let fullWidth = 0;
function noteFullHeight() {
  const vv = window.visualViewport;
  const h = Math.max(window.innerHeight, vv?.height ?? 0);
  if (window.innerWidth !== fullWidth) {
    fullWidth = window.innerWidth;
    fullHeight = h;
  } else if (!isTextField(document.activeElement)) fullHeight = Math.max(fullHeight, h);
}

/**
 * The part of the screen a box can use, in getBoundingClientRect() coordinates. While typing on a
 * phone the round pins itself to the visible area (marked data-viewport), so measure that: iOS and
 * other browsers disagree on what visualViewport.offsetTop is relative to, but the pinned box's
 * own rectangle is always where it really is.
 */
export function visibleArea(from?: Element | null): { top: number; height: number } {
  const pinned = from?.closest("[data-viewport]");
  if (pinned) {
    const r = pinned.getBoundingClientRect();
    return { top: r.top, height: r.height };
  }
  return { top: 0, height: window.innerHeight };
}

/**
 * While `focused` (a text field in this part of the page has focus) on a touch screen with the
 * on-screen keyboard up: the part of the page still visible above it.
 */
export function useKeyboard(focused: boolean): { top: number; height: number } | null {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    noteFullHeight();
    const onResize = () => noteFullHeight();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (!focused || !window.matchMedia?.("(pointer: coarse)").matches) {
      setArea(null);
      return;
    }
    const vv = window.visualViewport;
    const measure = () => {
      // only once the keyboard has actually taken space (focus alone can outlive it)
      if (!vv || fullHeight - vv.height < 120) return setArea(null);
      // position: fixed goes by the layout viewport, which offsetTop is measured from
      const next = { top: Math.max(0, Math.round(vv.offsetTop)), height: Math.round(vv.height) };
      setArea((a) => (a && a.top === next.top && a.height === next.height ? a : next));
    };
    measure();
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure);
    return () => {
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [focused]);
  return area;
}

/** Text fields that bring up the on-screen keyboard. */
export function isTextField(el: EventTarget | null): boolean {
  const e = el as HTMLInputElement | null;
  if (!e?.tagName) return false;
  if (e.tagName === "TEXTAREA" || e.isContentEditable) return true;
  return e.tagName === "INPUT" && !["checkbox", "radio", "range", "button", "submit", "color", "file"].includes(e.type);
}
