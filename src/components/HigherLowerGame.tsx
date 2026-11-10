"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameSettings, RoundResult, Track } from "@/lib/types";
import type { SnippetPlayer } from "@/lib/player";
import { rng } from "@/lib/random";
import { ensureExtras, metricValue } from "@/lib/extras";
import { HL_INFO, formatCount, formatMonth } from "@/lib/modes";
import { cleanTitle } from "@/lib/text";
import { GameHeader, PlayGlyph, StopGlyph, usePlayback, type TrackSource } from "./Game";
import { Button, cx } from "./ui";
import { ShortcutHelp, modKey, useShortcuts, type Shortcut } from "./Shortcuts";
import { LoadingNotes } from "./StatusScreen";

const POINTS = 100;

interface Props {
  source: TrackSource;
  player: SnippetPlayer;
  settings: GameSettings;
  totalRounds: number;
  seed: number;
  banner?: React.ReactNode;
  onFinish: (results: RoundResult[], note?: string) => void;
  onQuit: () => void;
}

export function formatMetric(t: Track, s: GameSettings): string {
  switch (s.hlMetric) {
    case "year": return t.year ? String(t.year) : "?";
    case "popularity": return t.rank != null ? formatCount(t.rank) : "?";
    case "plays": return t.lastfm ? formatCount(t.lastfm.playcount) : "?";
    case "added": return t.addedAt ? formatMonth(t.addedAt) : "?";
  }
}

const UNIT: Record<GameSettings["hlMetric"], string> = { year: "released", popularity: "Deezer popularity", plays: "Last.fm plays", added: "you saved it" };

export function HigherLowerGame({ source, player, settings, totalRounds, seed, banner, onFinish, onQuit }: Props) {
  const [a, setA] = useState<Track | null>(null);
  const [b, setB] = useState<Track | null>(null);
  const [revealed, setRevealed] = useState<null | { correct: boolean; choice: "higher" | "lower" }>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [lives, setLives] = useState(Math.max(1, settings.hlLives));
  const [loading, setLoading] = useState(true);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const { playing, play, stop } = usePlayback(player);
  const nextRef = useRef<Promise<Track | null> | null>(null);
  const info = HL_INFO[settings.hlMetric];
  const score = results.reduce((x, r) => x + r.points, 0);

  const fetchPlayable = useCallback(async (): Promise<Track | null> => {
    for (let i = 0; i < 25; i++) {
      const t = await source.next();
      if (!t) return null;
      if (!(await ensureExtras(t, settings).catch(() => false))) continue;
      if (metricValue(t, settings) == null) continue;
      if (await player.prepare(t).catch(() => false)) return t;
    }
    return null;
  }, [source, player, settings]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const first = await fetchPlayable();
      const second = first && (await fetchPlayable());
      if (!first || !second) return onFinish([], "Couldn't find two songs to compare with these settings.");
      setA(first);
      setB(second);
      setLoading(false);
      nextRef.current = fetchPlayable();
    })();
    return () => player.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) setPlayingKey(null);
  }, [playing]);

  async function hear(t: Track) {
    if (playingKey === t.key) return stop();
    stop();
    try {
      await player.activate(t, rng(seed + results.length));
      player.setTwist("none");
      setPlayingKey(t.key);
      play(8);
    } catch {
      /* ignore */
    }
  }

  function choose(choice: "higher" | "lower") {
    if (!a || !b || revealed) return;
    stop();
    const va = metricValue(a, settings)!;
    const vb = metricValue(b, settings)!;
    // the same year (or month) counts either way
    const sameBucket = settings.hlMetric === "added" ? formatMonth(a.addedAt!) === formatMonth(b.addedAt!) : va === vb;
    const correct = sameBucket || (choice === "higher" ? vb > va : vb < va);
    setRevealed({ correct, choice });
    if (!correct) setLives((l) => l - 1);
    setResults((r) => [...r, { track: b, guesses: [], solved: correct, listened: 0, points: correct ? POINTS : 0, versus: { track: a, metric: settings.hlMetric, choice, correct, a: va, b: vb } }]);
  }

  async function next() {
    if (!b || !revealed) return;
    stop();
    if (lives <= 0 || results.length >= totalRounds) return onFinish(results, lives <= 0 ? undefined : "That's every round.");
    setLoading(true);
    const c = await (nextRef.current ?? fetchPlayable());
    nextRef.current = null;
    if (!c) return onFinish(results, "Ran out of songs to compare.");
    setA(b);
    setB(c);
    setRevealed(null);
    setLoading(false);
    nextRef.current = fetchPlayable();
  }

  const ready = !loading && !!a && !!b;
  const shortcuts: Shortcut[] = [
    { keys: ["ArrowRight", "ArrowUp"], display: "→ / ↑", label: info.higher, run: () => choose("higher"), enabled: ready && !revealed },
    { keys: ["ArrowLeft", "ArrowDown"], display: "← / ↓", label: info.lower, run: () => choose("lower"), enabled: ready && !revealed },
    { keys: [" ", "b"], display: "Space / B", label: "Hear the new song", run: () => b && hear(b), enabled: ready },
    { keys: ["a"], display: "A", label: "Hear the first song", run: () => a && hear(a), enabled: ready },
    { keys: ["Enter"], display: "Enter", label: "Next song", run: next, enabled: ready && !!revealed },
    { keys: ["Enter"], mod: true, display: `${modKey()} Enter`, label: "Next song", run: next, enabled: ready && !!revealed, hidden: true },
  ];
  const { help, setHelp } = useShortcuts(shortcuts);

  const streak = (() => {
    let n = 0;
    for (let i = results.length - 1; i >= 0 && results[i].solved; i--) n++;
    return n;
  })();


  const isEnd = lives <= 0 || results.length >= totalRounds;
  const nextButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (revealed) nextButton.current?.focus({ preventScroll: true });
  }, [revealed]);

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-6 sm:px-10 tabular">
      <GameHeader onQuit={onQuit} roundNo={results.length + (revealed ? 0 : 1)} totalRounds={totalRounds} score={score} done={results.length} current={!revealed} playing={playing} label="Pick" endless={settings.rounds === 0} />
      <ShortcutHelp open={help} onClose={() => setHelp(false)} shortcuts={shortcuts} />
      <main className="mx-auto flex w-full max-w-[952px] flex-1 flex-col">
        {banner}
        {loading || !a || !b ? (
          <div className="flex flex-1 items-center justify-center pb-24">
            <LoadingNotes message="Lining up songs" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center pb-10 pt-4 sm:pb-14">
            <section className="text-center">
              <p className="hand text-[72px] leading-[0.95] sm:text-[96px]">
                <span className="sr-only">Streak </span>
                {streak}
              </p>
              <p className="mt-1 text-[15px] text-ink-3">
                Streak
                {settings.hlLives > 1 && ` · ${lives} ${lives === 1 ? "life" : "lives"}`}
              </p>
            </section>

            <div className="mt-8 grid gap-5 sm:mt-10 sm:grid-cols-2 sm:gap-12">
              <SongCard t={a} value={formatMetric(a, settings)} unit={UNIT[settings.hlMetric]} playing={playingKey === a.key} onHear={() => hear(a)} />
              <SongCard
                t={b}
                value={revealed ? formatMetric(b, settings) : "?"}
                unit={UNIT[settings.hlMetric]}
                playing={playingKey === b.key}
                onHear={() => hear(b)}
                verdict={revealed ? (revealed.correct ? "right" : "wrong") : undefined}
              />
            </div>

            <h2 className="hand mt-8 text-center text-[32px] leading-tight sm:mt-10 sm:text-[40px]">{info.question}</h2>
            <div className="mx-auto mt-5 grid w-full max-w-[520px] grid-cols-2 gap-3">
              <ChoicePill label={info.lower} state={pillState("lower", revealed)} onClick={() => choose("lower")} />
              <ChoicePill label={info.higher} state={pillState("higher", revealed)} onClick={() => choose("higher")} />
            </div>
            <p className="sr-only" aria-live="polite">
              {revealed ? (revealed.correct ? "Right" : lives > 0 ? `Wrong. ${lives} ${lives === 1 ? "life" : "lives"} left.` : "Wrong. That's the end of the run.") : ""}
            </p>
            <div className="mt-5 flex min-h-14 justify-center">
              {revealed && (
                <Button
                  ref={nextButton}
                  variant="primary"
                  onClick={next}
                  onKeyDown={(e) => {
                    // Space plays the new song on this screen, even with Next focused; ignore held-down Enter.
                    if (e.key === " ") {
                      e.preventDefault();
                      if (!e.repeat) hear(b);
                    } else if (e.key === "Enter" && e.repeat) e.preventDefault();
                  }}
                  onKeyUp={(e) => e.key === " " && e.preventDefault()}
                >
                  {isEnd ? "See results" : "Next song"}
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

type PillState = "idle" | "right" | "wrong" | "off";

/** After a pick: yours goes blue if right, red if wrong (and then the other one goes blue). */
function pillState(choice: "higher" | "lower", revealed: { correct: boolean; choice: "higher" | "lower" } | null): PillState {
  if (!revealed) return "idle";
  if (revealed.choice === choice) return revealed.correct ? "right" : "wrong";
  return revealed.correct ? "off" : "right";
}

function ChoicePill({ label, state, onClick }: { label: string; state: PillState; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state !== "idle"}
      className={cx(
        "flex min-h-16 items-center justify-center rounded-full border-2 px-5 text-[18px] font-semibold transition-[background-color,border-color,color,opacity,transform] sm:text-[19px]",
        state === "idle" && "border-ink text-ink hover:bg-card active:scale-[0.98]",
        state === "right" && "border-blue bg-blue text-paper",
        state === "wrong" && "border-red bg-red text-paper",
        state === "off" && "border-rule-strong text-ink-3",
      )}
    >
      {label}
    </button>
  );
}

function SongCard({ t, value, unit, playing, onHear, verdict }: { t: Track; value: string; unit: string; playing: boolean; onHear: () => void; verdict?: "right" | "wrong" }) {
  const title = cleanTitle(t.title);
  return (
    <article className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-col sm:items-center sm:gap-0 sm:text-center">
      <button type="button" onClick={onHear} aria-label={playing ? "Stop" : `Hear ${title}`} className="group relative aspect-square w-[76px] shrink-0 rounded-[6px] sm:w-[180px]">
        {t.image ? <img src={t.image} alt="" className="h-full w-full rounded-[6px] object-cover" /> : <span className="block h-full w-full rounded-[6px] bg-paper-2" />}
        <span
          className={cx(
            "absolute bottom-1.5 left-1.5 grid h-8 w-8 place-items-center rounded-full text-paper transition-colors sm:bottom-2.5 sm:left-2.5 sm:h-11 sm:w-11",
            playing ? "bg-blue" : "bg-ink/80 group-hover:bg-ink",
          )}
        >
          {playing ? <StopGlyph /> : <PlayGlyph />}
        </span>
      </button>
      <div className="min-w-0 sm:mt-4 sm:w-full">
        <div className="truncate text-[18px] font-semibold leading-tight sm:text-[20px]">{title}</div>
        <div className="mt-0.5 truncate text-[15px] text-ink-3 sm:text-[16px]">{t.artists.join(", ")}</div>
      </div>
      <div className="text-right sm:mt-3 sm:text-center">
        <div className={cx("hand text-[40px] leading-none sm:text-[56px]", verdict === "wrong" ? "text-red" : verdict === "right" ? "text-blue" : "text-ink")}>{value}</div>
        <div className="mt-1 text-[13px] text-ink-3">{unit}</div>
      </div>
    </article>
  );
}
