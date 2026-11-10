"use client";

import { useEffect, useRef, useState } from "react";
import type { GameSettings, RoundResult } from "@/lib/types";
import type { SnippetPlayer } from "@/lib/player";
import { recordScore } from "@/lib/settings";
import { rng } from "@/lib/random";
import { formatSeconds } from "@/lib/scoring";
import { cleanTitle } from "@/lib/text";
import { canShare, encodeChallenge, makeChallenge } from "@/lib/challenge";
import { FIELD_INFO, HL_INFO, describeMode, formatCount, formatMonth } from "@/lib/modes";
import { Button, cx } from "./ui";
import { ShortcutHelp, modKey, useShortcuts, type Shortcut } from "./Shortcuts";
import { Rolling } from "./motion";
import { WordmarkHeader } from "./StatusScreen";

interface Props {
  results: RoundResult[];
  settings: GameSettings;
  seed: number;
  note?: string;
  challengeScore?: number;
  onReplay: () => void;
  onNewGame: () => void;
  /** The game's player, still unlocked, for playing your best song under the results. */
  player?: SnippetPlayer;
  /** Which game this was, for the best score. */
  category?: string;
}

/** Faded ink for missed rounds. */
const FADED = "text-[#a39e93]";

/** Petaluma has no U+2212 minus, so hand-lettered negatives use a hyphen. */
const handNumber = (n: number) => (n < 0 ? `-${Math.abs(n).toLocaleString()}` : n.toLocaleString());

/** Rough width of a number set in Petaluma, in ems. */
function handWidth(s: string) {
  let w = 0;
  for (const c of s) w += c === "," || c === "." ? 0.21 : c === "1" ? 0.29 : c === "-" ? 0.42 : 0.61;
  return Math.max(w, 0.61);
}

export function Results({ results, settings, seed, note, challengeScore, onReplay, onNewGame, player, category }: Props) {
  const total = results.reduce((a, r) => a + r.points, 0);
  const best = useBestScore(category, settings.mode === "higherlower" ? results.reduce((acc, r) => (r.solved ? { cur: acc.cur + 1, max: Math.max(acc.max, acc.cur + 1) } : { cur: 0, max: acc.max }), { cur: 0, max: 0 }).max : total, results.length > 0);
  const { playingIndex, toggle: toggleSong } = useBestSong(results, player, seed, settings.volume * 0.6);
  const solved = results.filter((r) => r.solved);
  const mode = settings.mode ?? "classic";
  const titleOnly = mode === "classic" && (settings.fields?.length ?? 1) === 1 && (settings.fields?.[0] ?? "title") === "title";
  const shareable = canShare(settings);
  const longestStreak = results.reduce((acc, r) => (r.solved ? { cur: acc.cur + 1, max: Math.max(acc.max, acc.cur + 1) } : { cur: 0, max: acc.max }), { cur: 0, max: 0 }).max;
  const challengeTracks = mode === "higherlower" && results[0]?.versus ? [results[0].versus.track, ...results.map((r) => r.track)] : results.map((r) => r.track);
  const [copied, setCopied] = useState<"link" | "text" | null>(null);

  const challengeUrl = () => `${window.location.origin}/play?c=${encodeChallenge(makeChallenge(challengeTracks, settings, seed, total))}`;

  async function copy(what: "link" | "text") {
    const lines = [
      mode === "higherlower" ? `Earshot ${describeMode(settings)}: ${longestStreak} in a row` : `Earshot ${describeMode(settings)}: ${total.toLocaleString()} pts, ${solved.length}/${results.length}`,
      results.map((r) => (r.solved ? (r.listened <= 0.5 ? "■" : r.listened <= 2 ? "▣" : "□") : "×")).join(""),
    ];
    const text = what === "link" ? challengeUrl() : shareable ? `${lines.join("\n")}\nBeat me: ${challengeUrl()}` : lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  const shortcuts: Shortcut[] = [
    { keys: ["Enter", "r"], display: "Enter / R", label: "Play again", run: onReplay },
    { keys: ["Enter"], mod: true, typing: true, display: `${modKey()} Enter`, label: "Play again", run: onReplay, hidden: true },
    { keys: ["n"], display: "N", label: "New game", run: onNewGame },
    { keys: ["s"], display: "S", label: "Copy your score to share", run: () => copy("text"), enabled: results.length > 0 },
    { keys: ["c"], display: "C", label: "Copy the challenge link", run: () => copy("link"), enabled: shareable && results.length > 0 },
  ];
  const { help, setHelp } = useShortcuts(shortcuts);

  const versus =
    challengeScore == null
      ? null
      : total > challengeScore
        ? { text: `Beat ${challengeScore.toLocaleString()} by ${(total - challengeScore).toLocaleString()}`, className: "text-blue" }
        : total === challengeScore
          ? { text: `Tied ${challengeScore.toLocaleString()}`, className: "text-ink-2" }
          : { text: `${(challengeScore - total).toLocaleString()} short of ${challengeScore.toLocaleString()}`, className: "text-red" };

  const totalText = handNumber(total);
  const em = handWidth(totalText);

  return (
    <div className="flex min-h-dvh flex-col tabular">
      <ShortcutHelp open={help} onClose={() => setHelp(false)} shortcuts={shortcuts} />
      <WordmarkHeader />
      <main className="flex flex-1 items-center justify-center px-6 pb-6 pt-1 sm:px-14 sm:pb-14 sm:pt-8 lg:pb-20">
        <div className={cx("grid w-full items-center gap-x-16 gap-y-3 sm:gap-y-12", results.length ? "max-w-[1150px] lg:grid-cols-[minmax(0,440px)_minmax(0,600px)] lg:justify-between" : "max-w-[440px]")}>
          <section className="animate-rise min-w-0" aria-live="polite">
            <h1
              className={cx("hand whitespace-nowrap leading-[0.95]", total < 0 ? "text-red" : "text-ink")}
              style={{ fontSize: `min(160px, ${Math.floor(420 / em)}px, calc((100vw - 48px) / ${em.toFixed(2)}), 16dvh)` }}
            >
              <span className="sr-only">Score </span>
              <Rolling value={total} from={0} delay={150} duration={1100} format={handNumber} bump="" />
            </h1>
            {best && (
              <p style={{ animationDelay: "1100ms" }} className={cx("rise-in mt-1 text-[16px] font-semibold uppercase tracking-[0.12em]", best.isNew ? "text-blue" : "text-ink-3")}>
                {best.isNew ? (best.before == null ? "First score" : "New best") : `Best ${best.value.toLocaleString()}`}
              </p>
            )}
            {versus && <p className={cx("mt-2 text-[20px] font-semibold", versus.className)}>{versus.text}</p>}
            {note && <p className="mt-2 text-[15px] text-ink-3">{note}</p>}
            <div className="mt-5 flex flex-wrap gap-3 sm:mt-8">
              <Button variant="primary" autoFocus onClick={onReplay}>
                Play again
              </Button>
              <Button className="min-h-14 px-7 text-[18px]" onClick={onNewGame}>
                New game
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-7">
              <Button variant="text" className="text-[17px] font-medium!" onClick={() => copy("text")} disabled={!results.length}>
                {copied === "text" ? "Copied" : "Share score"}
              </Button>
              {shareable && (
                <Button variant="text" className="text-[17px] font-medium!" onClick={() => copy("link")} disabled={!results.length}>
                  {copied === "link" ? "Copied" : "Copy challenge link"}
                </Button>
              )}
            </div>
          </section>

          {results.length > 0 && <RoundList results={results} titleOnly={titleOnly} playingIndex={playingIndex} onToggle={toggleSong} />}
        </div>
      </main>
    </div>
  );
}

/** One row per round. On wide screens a long game scrolls inside the column. */
function RoundList({ results, titleOnly, playingIndex, onToggle }: { results: RoundResult[]; titleOnly: boolean; playingIndex: number | null; onToggle: (i: number) => void }) {
  const ref = useRef<HTMLOListElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [results.length]);

  return (
    <ol
      ref={ref}
      aria-label="Rounds"
      tabIndex={scrolls ? 0 : undefined}
      className="min-w-0 lg:max-h-[min(640px,calc(100dvh-210px))] lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]"
    >
      {results.map((r, i) => (
        <RoundRow key={i} r={r} titleOnly={titleOnly} delay={200 + i * 70} playing={playingIndex === i} onToggle={() => onToggle(i)} />
      ))}
    </ol>
  );
}

function RoundRow({ r, titleOnly, delay, playing, onToggle }: { r: RoundResult; titleOnly: boolean; delay: number; playing: boolean; onToggle: () => void }) {
  const missed = !r.solved && r.points <= 0;
  const status = rowStatus(r, titleOnly, missed);
  const detail = rowDetail(r);
  return (
    <li style={{ animationDelay: `${delay}ms` }} className="rise-in grid grid-cols-[44px_minmax(0,1fr)_auto_auto] items-center gap-x-3.5 border-t border-rule py-2 first:border-t-0 sm:grid-cols-[60px_minmax(0,1fr)_auto_minmax(88px,auto)] sm:gap-x-[18px] sm:py-[15px]">
      <button type="button" onClick={onToggle} aria-label={playing ? `Stop ${cleanTitle(r.track.title)}` : `Play ${cleanTitle(r.track.title)}`} className="relative block aspect-square w-full overflow-hidden rounded-[4px]">
        {r.track.image ? (
          <img src={r.track.image} alt="" loading="lazy" className={cx("h-full w-full object-cover", missed && !playing && "opacity-50")} />
        ) : (
          <span className={cx("block h-full w-full bg-paper-2", missed && !playing && "opacity-50")} />
        )}
        {playing && <PlayingBars />}
      </button>
      <span className="min-w-0">
        <span className={cx("block truncate text-[17px] font-semibold leading-tight sm:text-[20px]", missed ? "text-ink-3" : "text-ink")}>{cleanTitle(r.track.title)}</span>
        <span className={cx("mt-0.5 block truncate text-[14px] sm:text-[16px]", missed ? FADED : "text-ink-3")}>{r.track.artists.join(", ")}</span>
        {detail && <span className="mt-0.5 block truncate text-[14px] text-ink-3">{detail}</span>}
      </span>
      <span className={cx("text-right text-[15px] sm:text-[17px]", status.bad ? "text-red" : "text-ink-3")}>{status.text}</span>
      <span className={cx("hand text-right text-[30px] leading-none sm:text-[34px]", r.points > 0 ? "text-blue" : r.points < 0 ? "text-red" : FADED)}>{handNumber(r.points)}</span>
    </li>
  );
}

/** Three bars bouncing over the cover of the song that's playing. */
function PlayingBars() {
  return (
    <span className="absolute inset-0 flex items-end justify-center gap-[3px] bg-ink/45 pb-2.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="eq-bar w-[4px] rounded-full bg-paper" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}

/** Record this game's score; returns what to say about the best score. */
function useBestScore(category: string | undefined, score: number, played: boolean) {
  const [best, setBest] = useState<{ value: number; before: number | null; isNew: boolean } | null>(null);
  useEffect(() => {
    if (!category || !played) return;
    const before = recordScore(category, score);
    setBest({ value: before == null ? score : Math.max(before, score), before, isNew: before == null || score > before });
    // record once per results screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return best;
}

/** Plays the song you scored most on, quietly and on repeat, while the results are up. */
function useBestSong(results: RoundResult[], player: SnippetPlayer | undefined, seed: number, volume: number) {
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const wanted = useRef<number | null>(null);
  const start = async (i: number) => {
    if (!player) return;
    wanted.current = i;
    const t = results[i].track;
    try {
      if (!(await player.prepare(t))) return;
      if (wanted.current !== i) return;
      await player.activate(t, rng(seed + i));
      player.setTwist("none");
      player.setVolume(volume);
      const loop = () => {
        if (wanted.current !== i) return;
        if (document.hidden) return setPlayingIndex(null);
        player.play(30, loop).catch(() => setPlayingIndex(null));
      };
      setPlayingIndex(i);
      loop();
    } catch {
      setPlayingIndex(null);
    }
  };
  const stop = () => {
    wanted.current = null;
    player?.stop();
    setPlayingIndex(null);
  };
  useEffect(() => {
    let top = -1;
    results.forEach((r, i) => {
      if (r.points > 0 && (top < 0 || r.points > results[top].points)) top = i;
    });
    if (top >= 0) start(top);
    return () => {
      wanted.current = null;
      player?.stop();
    };
    // once, when the results open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggle = (i: number) => {
    player?.unlock();
    if (playingIndex === i) stop();
    else start(i);
  };
  return { playingIndex, toggle };
}

/** What sits beside the points: how much it took, or why it scored nothing. */
function rowStatus(r: RoundResult, titleOnly: boolean, missed: boolean): { text: string; bad?: boolean } {
  if (r.versus) return r.solved ? { text: "" } : { text: "Wrong", bad: true };
  if (missed) return { text: "Missed", bad: true };
  if (r.lyric) return { text: `${Math.round(r.lyric.similarity * 100)}%` };
  if (r.fields && !titleOnly) return { text: `${r.fields.filter((f) => f.outcome === "right").length}/${r.fields.length}` };
  return { text: r.solved ? formatSeconds(r.listened) : "" };
}

/** Mode-specific third line: the comparison, the lyric, or each answer's outcome. */
function rowDetail(r: RoundResult): string | null {
  if (r.versus) {
    const v = r.versus;
    const fmt = (n: number) => (v.metric === "added" ? formatMonth(new Date(n).toISOString()) : v.metric === "year" ? String(n) : formatCount(n));
    return `${fmt(v.b)} vs ${fmt(v.a)} · you said ${(v.choice === "higher" ? HL_INFO[v.metric].higher : HL_INFO[v.metric].lower).toLowerCase()}`;
  }
  if (r.lyric) return `“${r.lyric.line}”`;
  if (r.fields && r.fields.length > 1) {
    return r.fields.map((f) => `${FIELD_INFO[f.field].short} ${f.outcome === "right" ? "right" : f.outcome === "close" ? `close (${f.detail})` : "missed"}`).join(" · ");
  }
  return null;
}
