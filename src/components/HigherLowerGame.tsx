"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameSettings, RoundResult, Track } from "@/lib/types";
import type { SnippetPlayer } from "@/lib/player";
import { rng } from "@/lib/random";
import { ensureExtras, metricValue } from "@/lib/extras";
import { HL_INFO, formatCount, formatMonth } from "@/lib/modes";
import { cleanTitle } from "@/lib/text";
import { GameHeader, PlayGlyph, StopGlyph, usePlayback, type TrackSource } from "./Game";
import { Kbd, Spinner, cx } from "./ui";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (loading) return;
      if (!revealed && (e.key === "ArrowUp" || e.key === "ArrowRight")) choose("higher");
      else if (!revealed && (e.key === "ArrowDown" || e.key === "ArrowLeft")) choose("lower");
      else if (revealed && e.key === "Enter") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const streak = (() => {
    let n = 0;
    for (let i = results.length - 1; i >= 0 && results[i].solved; i--) n++;
    return n;
  })();

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-5 tabular">
      <GameHeader onQuit={onQuit} roundNo={results.length + (revealed ? 0 : 1)} totalRounds={totalRounds} score={score} done={results.length} current={!revealed} playing={playing} label="Pick" endless={settings.rounds === 0} />
      {banner}
      {loading || !a || !b ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-2">
          <span className="text-[15px]">
            Lining up songs <Spinner />
          </span>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <section className="flex items-end justify-between gap-3 pt-6">
            <div>
              <div className="text-[15px] text-ink-2">Streak</div>
              <div className="numeral text-[88px] leading-[0.85]">{streak}</div>
            </div>
            <div className="pb-1 text-right text-[15px] text-ink-2">
              {settings.hlLives > 1 && (
                <div>
                  {lives} {lives === 1 ? "life" : "lives"} left
                </div>
              )}
              <div>{info.label}</div>
            </div>
          </section>

          <SongRow t={a} value={formatMetric(a, settings)} unit={UNIT[settings.hlMetric]} playing={playingKey === a.key} onHear={() => hear(a)} />
          <p className="mt-5 text-[22px] font-bold leading-tight tracking-tight">{info.question}</p>
          <SongRow
            t={b}
            value={revealed ? formatMetric(b, settings) : "?"}
            unit={UNIT[settings.hlMetric]}
            playing={playingKey === b.key}
            onHear={() => hear(b)}
            verdict={revealed ? (revealed.correct ? "right" : "wrong") : undefined}
          />

          <div className="min-h-6 flex-1" />
          {!revealed ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => choose("lower")} className="flex h-16 items-center justify-center gap-2 border-2 border-ink text-[17px] font-bold hover:bg-paper-2">
                {info.lower} <Kbd>←</Kbd>
              </button>
              <button type="button" onClick={() => choose("higher")} className="flex h-16 items-center justify-center gap-2 bg-ink text-[17px] font-bold text-paper hover:bg-black">
                {info.higher} <Kbd>→</Kbd>
              </button>
            </div>
          ) : (
            <>
              <p className={cx("mb-2 text-[17px] font-semibold", !revealed.correct && "text-error")}>
                {revealed.correct ? "Right." : lives > 0 ? `Wrong. ${lives} ${lives === 1 ? "life" : "lives"} left.` : "Wrong. That's the end of the run."}
              </p>
              <button type="button" onClick={next} autoFocus className="flex h-14 items-center justify-between bg-ink px-5 text-[17px] font-bold text-paper hover:bg-black">
                {lives <= 0 || results.length >= totalRounds ? "See results" : "Next song"}
                <Kbd>Enter</Kbd>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SongRow({ t, value, unit, playing, onHear, verdict }: { t: Track; value: string; unit: string; playing: boolean; onHear: () => void; verdict?: "right" | "wrong" }) {
  return (
    <article className="mt-4 grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 border-t-2 border-ink pt-4">
      <button type="button" onClick={onHear} aria-label={playing ? "Stop" : `Hear ${cleanTitle(t.title)}`} className="group relative aspect-square w-full">
        {t.image ? <img src={t.image} alt="" className="h-full w-full object-cover" /> : <span className="block h-full w-full bg-paper-2" />}
        <span className={cx("absolute inset-0 flex items-center justify-center text-white transition-colors", playing ? "bg-signal/80" : "bg-ink/0 group-hover:bg-ink/50")}>
          <span className={cx(playing ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>{playing ? <StopGlyph /> : <PlayGlyph />}</span>
        </span>
      </button>
      <div className="min-w-0">
        <div className="truncate text-[19px] font-bold leading-tight">{cleanTitle(t.title)}</div>
        <div className="truncate text-[15px] text-ink-2">{t.artists.join(", ")}</div>
      </div>
      <div className="text-right">
        <div className={cx("numeral text-[44px] leading-[0.9]", verdict === "wrong" && "text-error")}>{value}</div>
        <div className="text-[12px] text-ink-2">{unit}</div>
      </div>
    </article>
  );
}
