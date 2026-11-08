"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameSettings, Guess, RoundResult, Track } from "@/lib/types";
import type { SnippetPlayer } from "@/lib/player";
import { pointsFor, formatSeconds } from "@/lib/scoring";
import { artistsOverlap, cleanTitle, titlesMatch } from "@/lib/text";
import { rng } from "@/lib/random";
import { GuessInput, type GuessValue } from "./GuessInput";
import { SnippetBar } from "./SnippetBar";
import { Button, Kbd, Spinner, cx } from "./ui";

export interface TrackSource {
  all: Track[];
  next(): Promise<Track | null>;
}

interface RoundState {
  index: number;
  track: Track;
  step: number;
  guesses: Guess[];
  status: "guessing" | "won" | "lost";
  points: number;
}

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

/** Splits "1.5s" into its number and unit so the unit can be set smaller. */
function Timecode({ seconds, className, unitClassName }: { seconds: number; className?: string; unitClassName?: string }) {
  const text = formatSeconds(seconds);
  return (
    <span className={cx("numeral leading-[0.85]", className)}>
      {text.slice(0, -1)}
      <span className={cx("tracking-normal", unitClassName)}>s</span>
    </span>
  );
}

const PlayGlyph = () => (
  <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
    <path d="M3 1.5v11l9.5-5.5z" />
  </svg>
);
const StopGlyph = () => (
  <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
    <rect x="2" y="2" width="10" height="10" />
  </svg>
);

export function Game({ source, player, settings, totalRounds, seed, banner, onFinish, onQuit }: Props) {
  const [round, setRound] = useState<RoundState | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [shake, setShake] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const nextRef = useRef<Promise<Track | null> | null>(null);
  const failures = useRef(0);
  const rafRef = useRef<number | null>(null);
  const steps = settings.steps;
  const last = steps.length - 1;
  const score = results.reduce((a, r) => a + r.points, 0);

  const fetchPlayable = useCallback(async (): Promise<Track | null> => {
    for (let i = 0; i < 25; i++) {
      const t = await source.next();
      if (!t) return null;
      if (await player.prepare(t).catch(() => false)) return t;
    }
    return null;
  }, [source, player]);

  const startRound = useCallback(
    async (index: number, prior: RoundResult[]) => {
      setLoading(true);
      setAudioError(null);
      player.stop();
      const t = await (nextRef.current ?? fetchPlayable());
      nextRef.current = null;
      if (!t) {
        onFinish(prior, prior.length === 0 ? "Couldn't find playable songs that match your settings." : "Ran out of songs that match your settings.");
        return;
      }
      try {
        await player.activate(t, rng(seed + index));
      } catch (e) {
        setAudioError((e as Error).message);
        if (++failures.current >= 4) {
          onFinish(prior, `Playback failed: ${(e as Error).message}`);
          return;
        }
        // skip this song and try another
        return startRound(index, prior);
      }
      failures.current = 0;
      setRound({ index, track: t, step: 0, guesses: [], status: "guessing", points: 0 });
      setLoading(false);
      if (index + 1 < totalRounds) nextRef.current = fetchPlayable();
    },
    [fetchPlayable, onFinish, player, seed, totalRounds],
  );

  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      startRound(0, []);
    }
    return () => {
      player.stop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tick = useCallback(() => {
    setElapsed(player.elapsed());
    rafRef.current = requestAnimationFrame(tick);
  }, [player]);

  const play = useCallback(
    async (seconds?: number) => {
      if (!round) return;
      const len = seconds ?? steps[round.step];
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setPlaying(true);
      setAudioError(null);
      try {
        await player.play(len, () => {
          setPlaying(false);
          setElapsed(null);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
        });
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        setPlaying(false);
        setAudioError((e as Error).message);
      }
    },
    [player, round, steps, tick],
  );

  const stop = useCallback(() => {
    player.stop();
    setPlaying(false);
    setElapsed(null);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, [player]);

  function finish(r: RoundState, won: boolean, guesses: Guess[]) {
    const wrong = guesses.filter((g) => !g.correct && !g.skipped).length;
    const listened = steps[r.step];
    const points = (won ? pointsFor(listened, settings) : 0) - wrong * settings.wrongPenalty;
    const done: RoundState = { ...r, guesses, status: won ? "won" : "lost", points };
    setRound(done);
    setResults((prev) => [...prev, { track: r.track, guesses, solved: won, listened, points }]);
  }

  function guess(g: GuessValue) {
    if (!round || round.status !== "guessing") return;
    const t = round.track;
    const titleOk = titlesMatch(g.title, t.title);
    const artistOk = !g.artist || !settings.strictArtist || artistsOverlap(g.artist.split(/,\s*/), t.artists);
    const correct = titleOk && artistOk;
    const entry: Guess = { text: g.artist ? `${g.title} · ${g.artist}` : g.title, artist: g.artist, correct, at: steps[round.step] };
    const guesses = [...round.guesses, entry];
    if (correct) {
      stop();
      return finish(round, true, guesses);
    }
    setShake((n) => n + 1);
    if (settings.wrongUnlocks) {
      if (round.step >= last) return finish(round, false, guesses);
      setRound({ ...round, step: round.step + 1, guesses });
    } else {
      setRound({ ...round, guesses });
    }
  }

  function skip() {
    if (!round || round.status !== "guessing") return;
    const guesses = [...round.guesses, { text: "Skipped", skipped: true, correct: false, at: steps[round.step] }];
    if (round.step >= last) {
      stop();
      return finish(round, false, guesses);
    }
    const next = { ...round, step: round.step + 1, guesses };
    setRound(next);
    // play the longer snippet straight away
    setTimeout(() => play(steps[next.step]), 0);
  }

  function giveUp() {
    if (!round || round.status !== "guessing") return;
    stop();
    finish(round, false, [...round.guesses, { text: "Gave up", skipped: true, correct: false, at: steps[round.step] }]);
  }

  function nextRound() {
    if (!round) return;
    stop();
    if (round.index + 1 >= totalRounds) return onFinish(results);
    startRound(round.index + 1, results);
  }

  // keyboard: space plays (outside text inputs), enter advances after a round
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        if (round?.status === "guessing") (playing ? stop() : play());
      } else if (e.key === "Enter" && round && round.status !== "guessing") {
        e.preventDefault();
        nextRound();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const wrongCount = round ? round.guesses.filter((g) => !g.correct && !g.skipped).length : 0;
  const potential = round ? pointsFor(steps[round.step], settings) - wrongCount * settings.wrongPenalty : 0;
  const roundNo = Math.min((round?.index ?? 0) + 1, totalRounds);
  const showSegments = totalRounds <= 30;

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-5 tabular">
      <header className="grid h-14 grid-cols-[1fr_auto_1fr] items-center">
        <button type="button" onClick={onQuit} className="h-11 justify-self-start text-[15px] text-ink-2 hover:text-ink">
          Quit
        </button>
        <span className="text-[15px] font-semibold condensed">
          Round {roundNo} <span className="font-medium text-ink-3">of {totalRounds}</span>
        </span>
        <span className="justify-self-end text-[15px]">
          <span className="font-bold">{score < 0 ? `\u2212${Math.abs(score).toLocaleString()}` : score.toLocaleString()}</span> <span className="text-ink-3">pts</span>
        </span>
      </header>
      {showSegments ? (
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${totalRounds}, minmax(0, 1fr))` }} aria-hidden>
          {Array.from({ length: totalRounds }, (_, i) => (
            <span key={i} className={cx("h-1", i < results.length ? "bg-ink" : i === results.length && round?.status === "guessing" ? (playing ? "bg-signal" : "bg-ink-3") : "bg-rule")} />
          ))}
        </div>
      ) : (
        <div className="h-1 bg-rule" aria-hidden>
          <div className="h-full bg-ink transition-[width]" style={{ width: `${(results.length / totalRounds) * 100}%` }} />
        </div>
      )}
      {banner}

      {loading || !round ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-2">
          <span className="text-[15px]">
            Finding a song <Spinner />
          </span>
          {audioError && <span className="text-sm text-error">{audioError}</span>}
        </div>
      ) : round.status === "guessing" ? (
        <div className="flex flex-1 flex-col">
          <section className="pt-7 text-center sm:pt-10" aria-live="polite">
            <div className="text-[15px] text-ink-2">You have</div>
            <Timecode seconds={steps[round.step]} className="block text-[136px] sm:text-[168px]" unitClassName="text-[52px] sm:text-[64px]" />
            <div className="mt-2.5 text-[15px] text-ink-2">
              Worth <span className={cx("font-bold", potential > 0 ? "text-ink" : "text-error")}>{potential.toLocaleString()}</span> if you get it now
            </div>
          </section>

          <div className="pt-5">
            <SnippetBar steps={steps} unlocked={round.step} elapsed={elapsed} settings={settings} />
          </div>

          <button
            type="button"
            onClick={() => (playing ? stop() : play())}
            className={cx(
              "mt-5 flex h-14 items-center justify-center gap-2.5 text-[17px] font-bold transition-colors",
              playing ? "bg-signal text-white" : "bg-ink text-paper hover:bg-black",
            )}
          >
            {playing ? <StopGlyph /> : <PlayGlyph />}
            {playing ? `Playing ${formatSeconds(steps[round.step])}` : `Play ${formatSeconds(steps[round.step])}`}
            <Kbd>Space</Kbd>
          </button>
          {audioError && <p className="mt-2 text-sm text-error">{audioError}</p>}

          {round.guesses.length > 0 && <GuessLog guesses={round.guesses} penalty={settings.wrongPenalty} />}

          <div className="min-h-6 flex-1" />

          <GuessInput pool={source.all} scope={settings.answerScope} onGuess={guess} onEmptySpace={() => (playing ? stop() : play())} shake={shake} />
          <div className="mt-1 flex items-center justify-between">
            <button type="button" onClick={skip} className="h-11 text-[15px] font-semibold hover:text-ink-2">
              {round.step < last ? `Skip to ${formatSeconds(steps[round.step + 1])}` : "Give up"}
            </button>
            {round.step < last && (
              <button type="button" onClick={giveUp} className="h-11 text-[15px] text-ink-2 hover:text-ink">
                Give up
              </button>
            )}
          </div>
          <p className="hidden text-center text-[13px] text-ink-3 sm:block">Space plays the snippet, also from the empty guess box. Enter picks the highlighted song.</p>
        </div>
      ) : (
        <Reveal round={round} settings={settings} onPlay={() => (playing ? stop() : play(steps[last]))} playing={playing} onNext={nextRound} isLast={round.index + 1 >= totalRounds} />
      )}
    </div>
  );
}

function GuessLog({ guesses, penalty, showCorrect }: { guesses: Guess[]; penalty: number; showCorrect?: boolean }) {
  return (
    <ul className="mt-4">
      {guesses.map((g, i) => (
        <li key={i} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 border-b border-rule py-2.5 text-[15px]">
          <span className="text-[13px] font-semibold text-ink-3 condensed">{formatSeconds(g.at)}</span>
          <span className={cx("truncate", g.correct ? "font-semibold" : g.skipped ? "italic text-ink-3" : "text-ink-2 line-through decoration-ink-2")}>{g.text}</span>
          {g.correct && showCorrect ? (
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" role="img" aria-label="Correct">
              <path d="M3 8.5l3.2 3L13 4.5" />
            </svg>
          ) : !g.skipped && !g.correct && penalty > 0 ? (
            <span className="text-sm font-semibold">&minus;{penalty}</span>
          ) : (
            <span />
          )}
        </li>
      ))}
    </ul>
  );
}

function Reveal({ round, settings, onPlay, playing, onNext, isLast }: { round: RoundState; settings: GameSettings; onPlay: () => void; playing: boolean; onNext: () => void; isLast: boolean }) {
  const t = round.track;
  const won = round.status === "won";
  const wrong = round.guesses.filter((g) => !g.correct && !g.skipped).length;
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  const solvedAt = settings.steps[round.step];
  const full = settings.steps[settings.steps.length - 1];
  const meta = [t.year ?? (t.decade ? `${t.decade}s` : null), t.album, t.sourceLabel].filter(Boolean).join(" · ");
  return (
    <div className="animate-rise flex flex-1 flex-col">
      <section className="flex items-end justify-between gap-3 pt-7" aria-live="polite">
        <div>
          <div className="text-[15px] text-ink-2">{won ? `Got it at ${formatSeconds(solvedAt)}` : "Not this time"}</div>
          <div className={cx("numeral text-[112px] leading-[0.85] sm:text-[128px]", round.points < 0 ? "text-error" : round.points === 0 ? "text-ink-3" : "")}>
            {round.points > 0 ? "+" : round.points < 0 ? "−" : ""}
            {Math.abs(round.points).toLocaleString()}
          </div>
        </div>
        {(won || wrong > 0) && (
          <div className="pb-2 text-right text-[13px] leading-normal text-ink-2">
            {won && <div>{pointsFor(solvedAt, settings).toLocaleString()} for {formatSeconds(solvedAt)}</div>}
            {wrong > 0 && (
              <div>
                &minus;{(wrong * settings.wrongPenalty).toLocaleString()} for {wrong} wrong guess{wrong > 1 ? "es" : ""}
              </div>
            )}
          </div>
        )}
      </section>

      <article className="mt-7 grid grid-cols-[112px_minmax(0,1fr)] items-end gap-4 border-t-2 border-ink pt-5 sm:grid-cols-[140px_minmax(0,1fr)]">
        {t.image ? <img src={t.image} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square w-full bg-paper-2" />}
        <div className="min-w-0">
          <h2 className="text-[26px] font-bold leading-[1.05] tracking-tight sm:text-3xl">{cleanTitle(t.title)}</h2>
          <div className="mt-1.5 text-[17px]">{t.artists.join(", ")}</div>
          {meta && <div className="mt-1 text-[13px] text-ink-2">{meta}</div>}
        </div>
      </article>

      {round.guesses.length > 0 && <GuessLog guesses={round.guesses} penalty={settings.wrongPenalty} showCorrect />}

      <div className="min-h-8 flex-1" />

      <Button onClick={onPlay} className="h-[52px] text-base">
        {playing ? <StopGlyph /> : <PlayGlyph />}
        {playing ? "Stop" : `Hear ${formatSeconds(full)}`}
      </Button>
      <button ref={nextRef} type="button" onClick={onNext} className="mt-2 flex h-14 items-center justify-between bg-ink px-5 text-[17px] font-bold text-paper hover:bg-black">
        {isLast ? "See results" : "Next song"}
        <Kbd>Enter</Kbd>
      </button>
    </div>
  );
}
