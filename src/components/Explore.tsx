"use client";


import Link from "next/link";
import { bestScores } from "@/lib/settings";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { GROUPS, PRESETS, presetById, startPreset, type Preset, type PresetGroup, type PresetIcon } from "@/lib/presets";
import { isConnected } from "@/lib/spotify/auth";
import { ShortcutHelp, useShortcuts, type Shortcut } from "./Shortcuts";
import { cx } from "./ui";

const GROUP_COLOR: Record<PresetGroup, string> = { hits: "text-blue", games: "text-red", spotify: "text-gold" };

/** 24-unit line icons for presets, drawn in currentColor. */
export function PresetIconSvg({ icon, className }: { icon: PresetIcon; className?: string }) {
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const shape = (() => {
    switch (icon) {
      case "play":
        return <path d="M7 5 L19 12 L7 19 Z" fill="currentColor" />;
      case "history":
        return (
          <>
            <path d="M3 12 A9 9 0 1 0 6 5.3" {...line} />
            <path d="M3 4 V9 H8" {...line} />
            <path d="M12 7 V12 L15 14" {...line} />
          </>
        );
      case "trending":
        return (
          <>
            <path d="M3 17 L9 11 L13 15 L21 7" {...line} />
            <path d="M15 7 H21 V13" {...line} />
          </>
        );
      case "list":
        return (
          <>
            <path d="M8 6 H20 M8 12 H20 M8 18 H20" {...line} />
            {[6, 12, 18].map((y) => (
              <circle key={y} cx={4} cy={y} r={1} {...line} fill="currentColor" />
            ))}
          </>
        );
      case "calendar":
        return (
          <>
            <rect x={3.5} y={5} width={17} height={15} rx={2} {...line} />
            <path d="M3.5 10 H20.5 M8 3 V7 M16 3 V7" {...line} />
          </>
        );
      case "rewind":
        return (
          <>
            <path d="M11 6 L3 12 L11 18 Z" fill="currentColor" />
            <path d="M20 6 L12 12 L20 18 Z" fill="currentColor" />
          </>
        );
      case "quote":
        return (
          <>
            <path d="M4 18 V12 C4 8.5 5.8 6.3 9 5.5 L9.6 7.2 C7.9 7.8 7 9 7 10.5 H10 V18 Z" fill="currentColor" />
            <path d="M14 18 V12 C14 8.5 15.8 6.3 19 5.5 L19.6 7.2 C17.9 7.8 17 9 17 10.5 H20 V18 Z" fill="currentColor" />
          </>
        );
      case "updown":
        return (
          <>
            <path d="M8 20 V4 M4 8 L8 4 L12 8" {...line} />
            <path d="M16 4 V20 M12 16 L16 20 L20 16" {...line} />
          </>
        );
      case "heart":
        return (
          <path
            d="M12 22 C 5 16.5, 1.5 13, 1.5 8.2 C 1.5 4.9, 4 2.5, 7 2.5 C 9 2.5, 10.8 3.6, 12 5.3 C 13.2 3.6, 15 2.5, 17 2.5 C 20 2.5, 22.5 4.9, 22.5 8.2 C 22.5 13, 19 16.5, 12 22 Z"
            fill="currentColor"
          />
        );
      case "star":
        return <path d="M12 3 L14.6 8.6 L20.5 9.2 L16 13.2 L17.3 19 L12 16 L6.7 19 L8 13.2 L3.5 9.2 L9.4 8.6 Z" {...line} />;
      case "user":
        return (
          <>
            <circle cx={12} cy={8} r={4} {...line} />
            <path d="M4 21 C 4.8 16.5, 8 14.5, 12 14.5 C 16 14.5, 19.2 16.5, 20 21" {...line} />
          </>
        );
    }
  })();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      {shape}
    </svg>
  );
}

/** Arrow keys move between tiles: left/right in reading order, up/down to the nearest tile in the next row. */
function moveFocus(e: KeyboardEvent<HTMLElement>) {
  const tiles = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-tile]"));
  const i = tiles.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  let next: HTMLButtonElement | undefined;
  if (e.key === "ArrowRight") next = tiles[i + 1];
  else if (e.key === "ArrowLeft") next = tiles[i - 1];
  else if (e.key === "Home") next = tiles[0];
  else if (e.key === "End") next = tiles[tiles.length - 1];
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const down = e.key === "ArrowDown";
    const r = tiles[i].getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let best = Infinity;
    for (const t of tiles) {
      const q = t.getBoundingClientRect();
      const dy = down ? q.top - r.top : r.top - q.top;
      if (dy < 4) continue;
      const score = dy * 10 + Math.abs(q.left + q.width / 2 - cx);
      if (score < best) {
        best = score;
        next = t;
      }
    }
  } else return;
  e.preventDefault();
  next?.focus();
}

export function Explore() {
  // best score per game, from this browser
  const [best, setBest] = useState<Record<string, number>>({});
  useEffect(() => setBest(bestScores()), []);
  const router = useRouter();
  const last = useRef(0);

  const start = (p: Preset) => {
    const now = Date.now();
    if (now - last.current < 1500) return;
    last.current = now;
    startPreset(p, (href) => router.push(href));
  };

  // Back from Spotify's login for a Spotify preset: start it.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("start");
    if (!id) return;
    window.history.replaceState(window.history.state, "", "/explore");
    const p = presetById(id);
    if (p && isConnected()) start(p);
  }, []);

  const shortcuts: Shortcut[] = [
    { keys: ["Escape"], display: "Esc", label: "Back", run: () => router.push("/") },
    { keys: [], display: "← → ↑ ↓", label: "Move between games", run: () => {} },
  ];
  const { help, setHelp } = useShortcuts(shortcuts);

  return (
    <div className="min-h-dvh">
      <ShortcutHelp open={help} onClose={() => setHelp(false)} shortcuts={shortcuts} />
      <header className="mx-auto flex w-full max-w-[1076px] items-center gap-2 px-5 pb-2 pt-6 sm:pt-10">
        <Link href="/" aria-label="Back" className="-ml-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-card">
          <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" aria-hidden>
            <path d="M12.5 4 L6.5 10 L12.5 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="hand pt-1.5 text-[52px] leading-[60px] sm:text-[66px] sm:leading-[70px]">Explore</h1>
      </header>

      <main className="mx-auto w-full max-w-[1076px] px-5 pb-[72px]" onKeyDown={moveFocus}>
        {GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`group-${g.id}`} className="pt-[34px]">
            <h2 id={`group-${g.id}`} className={cx("hand text-[34px] leading-[30px]", GROUP_COLOR[g.id])}>
              {g.label}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-5">
              {PRESETS.filter((p) => p.group === g.id).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-tile
                  onClick={() => start(p)}
                  className="flex min-h-32 w-full flex-col justify-between gap-4 rounded-[10px] bg-card p-[18px] text-left transition-[background-color,translate] duration-150 hover:-translate-y-0.5 hover:bg-[#f8f6f0] active:translate-y-0 sm:h-32 sm:w-[191px] sm:shrink-0"
                >
                  <span className="flex items-start justify-between gap-2">
                    <PresetIconSvg icon={p.icon} className={cx("h-7 w-7 shrink-0", GROUP_COLOR[g.id])} />
                    {best[p.id] != null && (
                      <span className="hand text-[22px] leading-none text-ink-2">
                        <span className="sr-only">Best </span>
                        {best[p.id].toLocaleString()}
                      </span>
                    )}
                  </span>
                  <span className="text-[19px] font-semibold leading-6 text-ink">{p.title}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
