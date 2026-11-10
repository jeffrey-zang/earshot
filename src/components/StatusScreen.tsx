"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Glyph, NOTE_COLORS, type GlyphType } from "./notation";
import { Button, Logo } from "./ui";
import { ShortcutHelp, modKey, useShortcuts, type Shortcut } from "./Shortcuts";

/** The hand-lettered wordmark, top-left, back to the start. */
export function WordmarkHeader() {
  return (
    <header className="px-6 pt-5 sm:px-14 sm:pt-7">
      <Link href="/" className="inline-block rounded-md">
        <Logo className="text-[40px] sm:text-[44px]" />
      </Link>
    </header>
  );
}

/** A full page with the wordmark and its content centred on the paper. */
export function StatusScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <WordmarkHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-[14vh] pt-8 text-center">{children}</main>
    </div>
  );
}

const BOB: GlyphType[] = ["quarter", "eighth", "half"];

/** Three notes bobbing in turn: the loading indicator (same notes as the game's "Finding a song"). */
export function BobbingNotes() {
  return (
    <svg width="112" height="56" viewBox="0 0 112 56" aria-hidden>
      {BOB.map((t, i) => (
        <Glyph key={t} type={t} x={20 + i * 34} y={42} fill={NOTE_COLORS[i]} className="note-bob" style={{ animationDuration: "1.2s", animationDelay: `${i * 0.18}s` }} />
      ))}
    </svg>
  );
}

/** Bobbing notes over one line of status text. */
export function LoadingNotes({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <BobbingNotes />
      <p role="status" className="text-[17px] text-ink-3">
        {message}
      </p>
    </div>
  );
}

/** Hand-lettered title, the message, a red retry pill and an optional outline pill. Cmd/Ctrl+Enter runs the red one. */
export function ErrorScreen({ title, message, primary, secondary }: { title: string; message: ReactNode; primary: { label: string; run: () => void }; secondary?: { label: string; run: () => void } }) {
  const shortcuts: Shortcut[] = [{ keys: ["Enter"], mod: true, display: `${modKey()} Enter`, label: primary.label, run: primary.run }];
  const { help, setHelp } = useShortcuts(shortcuts);
  return (
    <StatusScreen>
      <ShortcutHelp open={help} onClose={() => setHelp(false)} shortcuts={shortcuts} />
      <h1 className="hand text-[56px] leading-[1.05] sm:text-[72px]">{title}</h1>
      {message && <p className="mt-3 max-w-[560px] whitespace-pre-line text-[17px] leading-relaxed text-ink-2">{message}</p>}
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Button variant="primary" autoFocus onClick={primary.run}>
          {primary.label}
        </Button>
        {secondary && (
          <Button className="min-h-14 px-7 text-[18px]" onClick={secondary.run}>
            {secondary.label}
          </Button>
        )}
      </div>
    </StatusScreen>
  );
}
