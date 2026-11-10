"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { HOME_PICKS, PRESETS, QUICK_FIVE, launch, presetById, quickFive, startPreset, type Preset } from "@/lib/presets";
import { loadConfig } from "@/lib/settings";
import { getClientId, isConnected } from "@/lib/spotify/auth";
import { Glyph, INK, NOTE_COLORS, TrebleClef, type GlyphType } from "./notation";
import { ShortcutHelp, useShortcuts, type Shortcut } from "./Shortcuts";
import { SpotifyLogo, useSpotifyUser } from "./SpotifyConnect";
import { Logo } from "./ui";

/*
  The stage: a 1440 x 900 drawing centred on the Play button at (720, 400). Ported from the
  generator behind the approved design (seeded, so it is the same on server and client).
*/
type Pt = [number, number];
type Bez = [Pt, Pt, Pt, Pt];
interface Note { type: GlyphType; x: number; y: number; fill: string; rotate: number; scale: number; t: number; stream: number }

/** Park–Miller RNG, as in the generator, so the layout is the same every time. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
const bez = (p: Bez, t: number): Pt => {
  const u = 1 - t;
  const at = (k: 0 | 1) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k];
  return [at(0), at(1)];
};
const dbez = (p: Bez, t: number): Pt => {
  const u = 1 - t;
  const at = (k: 0 | 1) => 3 * u * u * (p[1][k] - p[0][k]) + 6 * u * t * (p[2][k] - p[1][k]) + 3 * t * t * (p[3][k] - p[2][k]);
  return [at(0), at(1)];
};
const f1 = (n: number) => n.toFixed(1);

const STAGE = (() => {
  // The ink staff on the left: five lines that curve gently and end under the Play button (720, 400).
  const left: Bez = [[-40, 200], [280, 120], [520, 230], [720, 170]];
  const staff = [-2, -1, 0, 1, 2].map((k) => {
    const d = k * 13 + 230;
    // Lead-in from far left so the staff still reaches the edge when the stage is narrower than the window.
    return `M -1400 ${290 + d} C -600 ${290 + d}, -200 ${240 + d}, -40 ${200 + d} C 280 ${120 + d}, 520 ${230 + d}, 720 ${170 + d}`;
  });
  const yAt = (x: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (bez(left, m)[0] < x) lo = m;
      else hi = m;
    }
    return bez(left, lo)[1] + 230;
  };
  const r3 = seeded(3);
  const phrase: [GlyphType, number][] = [["three", 150], ["eighth", 228], ["half", 272], ["three", 318], ["eighth", 398], ["half", 440], ["three", 486], ["eighth", 566], ["half", 606]];
  const leftNotes = phrase.map(([type, x], i): Note => {
    const y = yAt(x) + 8 + Math.sin(i * 1.7) * 16 + (r3() - 0.5) * 14;
    const rotate = (r3() - 0.5) * 26;
    const scale = 0.95 + r3() * 0.35;
    return { type, x, y, fill: INK, rotate, scale, t: x / 720, stream: -1 };
  });

  // Four thin staves branch out of the button: blue up, ink across, red slightly down, yellow down.
  const colors = [NOTE_COLORS[0], INK, NOTE_COLORS[1], NOTE_COLORS[2]];
  const ribbons: Bez[] = [
    [[812, 370], [1000, 245], [1200, 125], [1480, 105]],
    [[816, 390], [1040, 330], [1250, 265], [1480, 285]],
    [[816, 410], [1050, 410], [1230, 505], [1480, 480]],
    [[812, 430], [980, 565], [1200, 690], [1480, 715]],
  ];
  const types: GlyphType[] = ["eighth", "three", "half", "eighth", "eighth", "three", "half"];
  const r = seeded(45);
  const placed: { x: number; y: number; r: number }[] = [];
  const notes: Note[] = [];
  const put = (n: Note) => {
    const rad = (n.type === "three" ? 30 : 16) * n.scale;
    if (n.x > 1500 || n.y < 60 || n.y > 780) return;
    if (n.x > 590 && n.x < 860 && n.y > 270 && n.y < 640) return;
    if (placed.some((q) => Math.hypot(q.x - n.x, q.y - n.y) < (q.r + rad) * 0.8)) return;
    placed.push({ x: n.x, y: n.y, r: rad });
    notes.push(n);
  };
  const lines: { d: string; stroke: string; opacity: number }[] = [];
  ribbons.forEach((p, c) => {
    const fill = colors[c];
    for (let k = -2; k <= 2; k++) {
      const off = k * 7;
      const pts: Pt[] = [];
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const [x, y] = bez(p, t);
        const [dx, dy] = dbez(p, t);
        const l = Math.hypot(dx, dy);
        const w = off * (0.45 + t * 1.45);
        pts.push([x - (dy / l) * w, y + (dx / l) * w]);
      }
      // Run each line in from the button's centre, and on past the right edge (easing to level)
      // so the staves still reach the window's edge when the stage is narrower than the window.
      const [ax, ay] = pts[pts.length - 2];
      const [bx, by] = pts[pts.length - 1];
      const len = Math.hypot(bx - ax, by - ay);
      const [qx, qy] = [bx + ((bx - ax) / len) * 400, by + ((by - ay) / len) * 400];
      const body = pts.map((q) => `${f1(q[0])} ${f1(q[1])}`).join(" L");
      lines.push({ d: `M720 400 L${body} Q ${f1(qx)} ${f1(qy)}, ${f1(bx + 1600)} ${f1(qy)}`, stroke: fill, opacity: c === 1 ? 0.7 : 0.55 });
    }
    let i = 0;
    for (let t = 0.1; t < 0.98; t += 0.075 + r() * 0.05) {
      const [x, y] = bez(p, t);
      const [dx, dy] = dbez(p, t);
      const l = Math.hypot(dx, dy);
      const d = (r() - 0.5) * 2 * (8 + t * 28);
      const type = types[(i + c) % types.length];
      const rotate = ((Math.atan2(dy, dx) * 180) / Math.PI) * 0.5 + (r() - 0.5) * 24;
      const scale = (0.7 + t * 0.75) * (0.85 + r() * 0.3);
      put({ type, x: x - (dy / l) * d, y: y + (dx / l) * d, fill, rotate, scale, t, stream: c });
      i++;
    }
  });
  return { staff, leftNotes, lines, notes };
})();

/* Entrance: the black phrase fades in left to right, then the coloured notes hop out from the button, nearest first. */
const LEFT_DELAY = STAGE.leftNotes.map((_, i) => 120 + i * 70);
const HOP_RANK = (() => {
  const order = STAGE.notes.map((n, i) => ({ t: n.t, i })).sort((a, b) => a.t - b.t);
  const rank: number[] = [];
  order.forEach(({ i }, r) => (rank[i] = r));
  return rank;
})();
const HOP_START = 120 + STAGE.leftNotes.length * 70;
const HOP_STEP = 65;
const HOP_MS = 700;

function Stage() {
  return (
    <svg
      viewBox="0 0 1440 900"
      fill="none"
      aria-hidden
      focusable="false"
      className="pointer-events-none absolute overflow-visible"
      style={{
        width: "calc(1440 * var(--s))",
        height: "calc(900 * var(--s))",
        left: "calc(50% - 720 * var(--s))",
        top: "calc(var(--cy) - 400 * var(--s))",
      }}
    >
      {STAGE.staff.map((d) => (
        <path key={d} d={d} stroke={INK} strokeWidth={1.5} />
      ))}
      <TrebleClef x={51} y={306} height={180} />
      {STAGE.leftNotes.map((n, i) => (
        <Glyph
          key={i}
          type={n.type}
          x={n.x}
          y={n.y}
          fill={n.fill}
          rotate={n.rotate}
          scale={n.scale}
          className="animate-rise"
          style={{ animationDelay: `${LEFT_DELAY[i]}ms`, animationDuration: "560ms", animationFillMode: "both" }}
        />
      ))}
      {STAGE.lines.map((l, i) => (
        <path key={i} d={l.d} stroke={l.stroke} strokeOpacity={l.opacity} strokeWidth={1.3} />
      ))}
      {STAGE.notes.map((n, i) => {
        const rank = HOP_RANK[i];
        const delay = HOP_START + rank * HOP_STEP;
        const glyph = (
          <Glyph type={n.type} x={n.x} y={n.y} fill={n.fill} rotate={n.rotate} scale={n.scale} className="note-hop" style={{ animationDelay: `${delay}ms` }} />
        );
        // A few keep bobbing gently once they've landed.
        return rank % 5 === 2 ? (
          <g key={i} className="note-bob" style={{ animationDelay: `${delay + HOP_MS + (rank % 3) * 500}ms` }}>
            {glyph}
          </g>
        ) : (
          <g key={i}>{glyph}</g>
        );
      })}
    </svg>
  );
}

const PICKS = HOME_PICKS.map(presetById).filter((p): p is Preset => !!p);
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function Home() {
  const router = useRouter();
  const user = useSpotifyUser();
  const last = useRef(0);

  const go = (href: string) => router.push(href);
  /** Ignore a second trigger while the first is still navigating. */
  const once = (fn: () => void) => {
    const now = Date.now();
    if (now - last.current < 1500) return;
    last.current = now;
    fn();
  };
  const play = () => once(() => go(launch(quickFive(loadConfig()))));
  const start = (p: Preset) => once(() => startPreset(p, go));

  const shortcuts: Shortcut[] = [
    { keys: ["Enter"], display: "Enter", label: "Play", run: play },
    { keys: ["Enter"], mod: true, display: "Enter", label: "Play", run: play, hidden: true },
    {
      keys: DIGITS,
      display: "1 – 9",
      label: "Start a game",
      hidden: true,
      run: (k) => {
        const list = [QUICK_FIVE, ...PRESETS].filter((p) => !p.spotify || isConnected() || !!getClientId());
        const p = list[+k - 1];
        if (p) start(p);
      },
    },
  ];
  const { help, setHelp } = useShortcuts(shortcuts);

  return (
    <main
      className={[
        "@container relative flex min-h-dvh flex-col overflow-hidden sm:block sm:h-dvh sm:min-h-[620px]",
        // Stage scale (px per design unit), Play button size and the button's centre line.
        "[--h:max(100dvh,620px)] [--s:min(calc(100cqw/1440),calc(var(--h)/900))] [--b:clamp(128px,calc(176*var(--s)),208px)] [--cy:44.444%]",
        "max-sm:[--s:0.6px] max-sm:[--b:120px] max-sm:[--cy:50%]",
      ].join(" ")}
    >
      <ShortcutHelp open={help} onClose={() => setHelp(false)} shortcuts={shortcuts} />

      <header className="relative z-10 flex items-center justify-between gap-4 px-5 pt-6 sm:absolute sm:inset-x-0 sm:top-0 sm:px-14 sm:py-8">
        <h1>
          <Logo className="text-[38px]! leading-[36px]! sm:text-[44px]!" />
        </h1>
        {user.connected && user.name && (
          <p className="-mr-3 flex min-w-0 items-center gap-2 rounded-full bg-paper py-1 pl-2 pr-3 text-[16px] text-ink-2">
            <SpotifyLogo className="h-5 w-5 shrink-0 text-[#1DB954]" />
            <span className="truncate">{user.name}</span>
          </p>
        )}
      </header>

      <div className="relative min-h-[300px] flex-1 overflow-hidden sm:absolute sm:inset-0">
        <Stage />
        <button
          type="button"
          autoFocus
          aria-label="Play"
          onClick={play}
          className="absolute left-1/2 top-(--cy) z-10 grid size-(--b) -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-red shadow-[0_0_0_6px_var(--color-paper),0_0_0_8px_var(--color-ink)] transition-[background-color,box-shadow,scale] duration-150 hover:bg-[#9e2c2c] focus-visible:shadow-[0_0_0_6px_var(--color-paper),0_0_0_11px_var(--color-ink)] focus-visible:outline-none! active:scale-[0.97]"
        >
          <svg viewBox="0 0 52 58" className="ml-[5%] w-[32%]" aria-hidden>
            <path d="M6 4.5 L48 29 L6 53.5 Z" fill="var(--color-paper)" stroke="var(--color-paper)" strokeWidth={6} strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="mt-2 flex justify-center px-5 sm:absolute sm:inset-x-0 sm:top-[calc(var(--cy)_+_var(--b)/2_+_8px_+_max(36px,calc(60*var(--s))))] sm:mt-0">
        <Link
          href="/custom"
          className="inline-flex h-[58px] items-center gap-3 rounded-full border-[1.5px] border-ink pl-[22px] pr-7 text-[19px] font-semibold text-ink transition-colors hover:bg-card"
        >
          <SpotifyLogo className="h-[26px] w-[26px] text-[#1DB954]" />
          Play your Spotify
        </Link>
      </div>

      <nav
        aria-label="Explore"
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-5 pb-8 pt-4 sm:absolute sm:inset-x-0 sm:bottom-[max(28px,calc(60*var(--s)))] sm:gap-x-10 sm:gap-y-3 sm:px-10 sm:pb-0 sm:pt-0"
      >
        <div className="flex basis-full justify-center sm:basis-auto">
          <Link href="/explore" className="hand text-[26px] leading-8 text-blue sm:text-[30px]">
            Explore
          </Link>
        </div>
        {PICKS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => start(p)}
            className="py-2 text-[18px] leading-[26px] text-ink decoration-1 underline-offset-4 hover:underline max-sm:hidden sm:py-0"
          >
            {p.title}
          </button>
        ))}
        <Link href="/explore" className="py-2 text-[18px] font-bold leading-[26px] text-ink decoration-1 underline-offset-4 hover:underline max-sm:hidden sm:py-0">
          More
        </Link>
      </nav>
    </main>
  );
}
