"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameSettings, Guess, RoundResult, Track } from "@/lib/types";
import type { SnippetPlayer } from "@/lib/player";
import { pointsFor, formatSeconds } from "@/lib/scoring";
import { artistsOverlap, cleanTitle, titlesMatch } from "@/lib/text";
import { rng } from "@/lib/random";
import { GuessInput, type GuessValue } from "./GuessInput";
import { SnippetBar } from "./SnippetBar";
import { Button, Spinner, cx } from "./ui";

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
    const entry: Guess = { text: g.artist ? `${g.title} by ${g.artist}` : g.title, artist: g.artist, correct, at: steps[round.step] };
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

  const potential = round ? pointsFor(steps[round.step], settings) - round.guesses.filter((g) => !g.correct && !g.skipped).length * settings.wrongPenalty : 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-8 pt-4">
      <header className="flex items-center justify-between py-2">
        <button type="button" onClick={onQuit} className="rounded-lg px-2 py-1 text-sm text-dim hover:bg-panel2 hover:text-fg">
          Quit
        </button>
        <div className="text-sm text-dim tabular">
          Round <span className="text-fg">{Math.min((round?.index ?? 0) + 1, totalRounds)}</span> / {totalRounds}
        </div>
        <div className="text-sm tabular">
          <span className="font-semibold text-fg">{score.toLocaleString()}</span> <span className="text-dim">pts</span>
        </div>
      </header>
      <div className="h-1 overflow-hidden rounded-full bg-panel2">
        <div className="h-full bg-accent transition-all" style={{ width: `${(results.length / totalRounds) * 100}%` }} />
      </div>
      {banner}

      {loading || !round ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-dim">
          <Spinner className="h-6 w-6" />
          <span className="text-sm">Finding a song</span>
          {audioError && <span className="text-xs text-bad">{audioError}</span>}
        </div>
      ) : round.status === "guessing" ? (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
            <button
              type="button"
              onClick={() => (playing ? stop() : play())}
              aria-label={playing ? "Stop" : `Play ${formatSeconds(steps[round.step])}`}
              className={cx(
                "group relative flex h-32 w-32 items-center justify-center rounded-full transition sm:h-36 sm:w-36",
                playing ? "bg-accent text-ink" : "bg-panel2 text-fg ring-1 ring-line hover:ring-accent/60",
              )}
            >
              {playing && <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />}
              {playing ? (
                <svg viewBox="0 0 24 24" className="relative h-10 w-10" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="relative ml-1 h-12 w-12" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
              )}
            </button>
            <div className="text-center">
              <div className="text-4xl font-bold tracking-tight tabular">{formatSeconds(steps[round.step])}</div>
              <div className="mt-1 text-sm text-dim">
                worth <span className={cx("font-semibold tabular", potential > 0 ? "text-gold" : "text-bad")}>{potential.toLocaleString()}</span> pts if you get it now
              </div>
            </div>
            {audioError && <p className="text-sm text-bad">{audioError}</p>}
          </div>

          <div className="space-y-4">
            <SnippetBar steps={steps} unlocked={round.step} elapsed={elapsed} />
            {round.guesses.length > 0 && (
              <ul className="space-y-1.5">
                {round.guesses.map((g, i) => (
                  <li key={i} className={cx("flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1", g.skipped ? "text-dim ring-line" : "bg-bad/10 text-bad ring-bad/25")}>
                    <span className="w-10 shrink-0 text-xs tabular opacity-70">{formatSeconds(g.at)}</span>
                    <span className="truncate">{g.text}</span>
                    {!g.skipped && settings.wrongPenalty > 0 && <span className="ml-auto shrink-0 text-xs tabular">-{settings.wrongPenalty}</span>}
                  </li>
                ))}
              </ul>
            )}
            <GuessInput pool={source.all} scope={settings.answerScope} onGuess={guess} onEmptySpace={() => (playing ? stop() : play())} shake={shake} />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={skip}>
                {round.step < last ? `Skip (+${formatSeconds(steps[round.step + 1] - steps[round.step])})` : "Give up"}
              </Button>
              {round.step < last && (
                <Button variant="ghost" onClick={giveUp}>
                  Give up
                </Button>
              )}
            </div>
            <p className="text-center text-xs text-faint">Space plays the snippet (also in the empty search box). Enter picks the highlighted song.</p>
          </div>
        </div>
      ) : (
        <Reveal round={round} settings={settings} onPlay={() => (playing ? stop() : play(steps[last]))} playing={playing} onNext={nextRound} isLast={round.index + 1 >= totalRounds} />
      )}
    </div>
  );
}

function Reveal({ round, settings, onPlay, playing, onNext, isLast }: { round: RoundState; settings: GameSettings; onPlay: () => void; playing: boolean; onNext: () => void; isLast: boolean }) {
  const t = round.track;
  const won = round.status === "won";
  const wrong = round.guesses.filter((g) => !g.correct && !g.skipped).length;
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  return (
    <div className="animate-pop flex flex-1 flex-col justify-center gap-6 py-8">
      <div className="text-center">
        <div className={cx("text-sm font-semibold uppercase tracking-wider", won ? "text-good" : "text-bad")}>
          {won ? `Got it in ${formatSeconds(settings.steps[round.step])}` : "Not this time"}
        </div>
        <div className={cx("mt-1 text-5xl font-bold tracking-tight tabular", round.points > 0 ? "text-fg" : round.points < 0 ? "text-bad" : "text-dim")}>
          {round.points > 0 ? "+" : ""}
          {round.points.toLocaleString()}
        </div>
        {(won || wrong > 0) && (
          <div className="mt-1 text-xs text-dim tabular">
            {won && `${pointsFor(settings.steps[round.step], settings).toLocaleString()} for ${formatSeconds(settings.steps[round.step])}`}
            {won && wrong > 0 && ", "}
            {wrong > 0 && `-${(wrong * settings.wrongPenalty).toLocaleString()} for ${wrong} wrong guess${wrong > 1 ? "es" : ""}`}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 rounded-2xl bg-panel p-4 ring-1 ring-line">
        {t.image ? <img src={t.image} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" /> : <div className="h-24 w-24 shrink-0 rounded-xl bg-line" />}
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold leading-tight">{cleanTitle(t.title)}</div>
          <div className="mt-1 text-dim">{t.artists.join(", ")}</div>
          <div className="mt-1 text-xs text-faint">
            {[t.year ?? (t.decade ? `${t.decade}s` : null), t.album, t.sourceLabel].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button type="button" onClick={onPlay} aria-label={playing ? "Stop" : "Play more"} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-panel2 ring-1 ring-line hover:ring-accent/60">
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
          )}
        </button>
      </div>
      {round.guesses.length > 0 && (
        <ul className="space-y-1 text-sm">
          {round.guesses.map((g, i) => (
            <li key={i} className={cx("flex gap-2", g.correct ? "text-good" : g.skipped ? "text-faint" : "text-bad")}>
              <span className="w-10 shrink-0 text-xs tabular opacity-70">{formatSeconds(g.at)}</span>
              <span className="truncate">{g.text}</span>
            </li>
          ))}
        </ul>
      )}
      <Button ref={nextRef} variant="primary" className="py-3 text-base" onClick={onNext}>
        {isLast ? "See results" : "Next song"}
      </Button>
    </div>
  );
}
