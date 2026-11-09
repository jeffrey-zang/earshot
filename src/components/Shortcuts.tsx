"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

export interface Shortcut {
  /** KeyboardEvent.key values (letters lower-case), e.g. [" "], ["s"], ["ArrowLeft"]. */
  keys: string[];
  /** How the key is shown in the help overlay, e.g. "Space" or "Shift Enter". */
  display: string;
  label: string;
  /** Receives the pressed key (lower-cased for letters). */
  run: (key: string) => void;
  /** Also works while typing in an answer box. */
  typing?: boolean;
  shift?: boolean;
  enabled?: boolean;
  /** Works but isn't listed in the overlay. */
  hidden?: boolean;
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

/**
 * Global keyboard shortcuts for a screen. Listens in the capture phase so shortcuts like
 * Shift+Enter win over a form's own Enter-to-submit. Single keys are ignored while typing
 * unless a shortcut opts in, and Space/Enter on a focused button keep their normal meaning.
 */
export function useShortcuts(shortcuts: Shortcut[]) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;
  const [help, setHelp] = useState(false);
  const helpRef = useRef(help);
  helpRef.current = help;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const typing = isTyping(e.target);
      if (helpRef.current) {
        if (e.key === "Escape" || e.key === "?") {
          e.preventDefault();
          setHelp(false);
        }
        return;
      }
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setHelp(true);
        return;
      }
      const el = e.target as HTMLElement | null;
      if (!typing && (e.key === " " || e.key === "Enter") && el?.closest?.("button, a, summary, [role=option]")) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      for (const s of ref.current) {
        if (s.enabled === false) continue;
        if (typing && !s.typing) continue;
        if (!s.keys.includes(key)) continue;
        if (/^[a-z0-9 ]$|^[A-Z]/.test(key) && !!s.shift !== e.shiftKey) continue;
        if (e.repeat && key !== "ArrowUp" && key !== "ArrowDown") return;
        e.preventDefault();
        e.stopPropagation();
        s.run(key);
        return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return { help, setHelp };
}

/** Key caps, e.g. "Shift Enter" -> two caps. */
export function Keys({ display, className }: { display: string; className?: string }) {
  return (
    <span className={cx("inline-flex flex-wrap gap-1", className)}>
      {display.split(" / ").map((alt, i) => (
        <span key={i} className="inline-flex gap-1">
          {i > 0 && <span className="text-ink-3">or</span>}
          {alt.split(" ").map((k, j) => (
            <kbd key={j} className="min-w-7 border border-ink bg-field px-1.5 py-0.5 text-center font-sans text-[13px] font-semibold leading-tight">
              {k}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

export function ShortcutHelp({ open, onClose, shortcuts, title = "Keyboard shortcuts" }: { open: boolean; onClose: () => void; shortcuts: Shortcut[]; title?: string }) {
  if (!open) return null;
  const rows = shortcuts.filter((s) => !s.hidden && s.enabled !== false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-5" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={title} className="animate-rise w-full max-w-md border-2 border-ink bg-paper p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-ink-2 hover:text-ink">
            Close <Keys display="Esc" className="ml-1" />
          </button>
        </div>
        <dl className="mt-2">
          {rows.map((s) => (
            <div key={s.display + s.label} className="flex items-center justify-between gap-4 border-b border-rule py-2 text-[15px]">
              <dt>{s.label}</dt>
              <dd className="shrink-0">
                <Keys display={s.display} />
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 py-2 text-[15px]">
            <dt>Show or hide this list</dt>
            <dd>
              <Keys display="?" />
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
