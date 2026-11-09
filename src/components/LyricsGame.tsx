"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameSettings, RoundResult, Track } from "@/lib/types";
import type { SnippetPlayer } from "@/lib/player";
import { rng } from "@/lib/random";
import { ensureExtras } from "@/lib/extras";
import { cleanTitle } from "@/lib/text";
import { lineShape, lineSimilarity, lyricWords, markWords, pickLine } from "@/lib/lyrics";
import { GameHeader, PlayGlyph, StopGlyph, TrackCard, usePlayback, type TrackSource } from "./Game";
import { Button, Kbd, Spinner, cx } from "./ui";

type Hint = "prev" | "first" | "shape";
const HINT_LABEL: Record<Hint, string> = { prev: "Show the line before", first: "First word", shape: "Word lengths" };
const HINT_COST = 0.7;

interface RoundState {
  index: number;
  track: Track;
  line: number;
  /** Audio lines up with the lyric timestamps (full tracks + synced lyrics). */
  aligned: boolean;
  clip: number;
  hints: Hint[];
  guess?: string;
  similarity?: number;
  points?: number;
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

export function LyricsGame({ source, player, settings, totalRounds, seed, banner, onFinish, onQuit }: Props) {
  const [round, setRound] = useState<RoundState | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const { playing, error: audioError, play, stop } = usePlayback(player);
  const nextRef = useRef<Promise<Track | null> | null>(null);
  const score = results.reduce((a, r) => a + r.points, 0);

  const fetchPlayable = useCallback(async (): Promise<Track | null> => {
    for (let i = 0; i < 30; i++) {
      const t = await source.next();
      if (!t) return null;
      if (!(await ensureExtras(t, settings).catch(() => false))) continue;
      if (await player.prepare(t).catch(() => false)) return t;
    }
    return null;
  }, [source, player, settings]);

  const startRound = useCallback(
    async (index: number, prior: RoundResult[]) => {
      setLoading(true);
      stop();
      for (let attempt = 0; attempt < 10; attempt++) {
        const t = await (nextRef.current ?? fetchPlayable());
        nextRef.current = null;
        if (!t) {
          onFinish(prior, prior.length === 0 ? "Couldn't find songs with lyrics that match your settings." : "Ran out of songs with lyrics.");
          return;
        }
        const lyrics = t.lyrics!;
        const aligned = player.fullTrack && lyrics.synced;
        const lead = Math.max(2, settings.lyricLead);
        const line = pickLine(lyrics.lines, rng(seed + index), aligned ? lead : null);
        if (line == null) continue;
        try {
          await player.activate(t, rng(seed + index));
        } catch {
          continue;
        }
        player.setTwist("none");
        let clip = 10;
        if (aligned) {
          player.setStart(lyrics.lines[line].time! - lead);
          clip = lead - 0.15;
        }
        setRound({ index, track: t, line, aligned, clip, hints: aligned ? [] : ["prev"] });
        setText("");
        setLoading(false);
        if (index + 1 < totalRounds) nextRef.current = fetchPlayable();
        return;
      }
      onFinish(prior, "Couldn't line up lyrics for these songs.");
    },
    [fetchPlayable, onFinish, player, seed, settings.lyricLead, stop, totalRounds],
  );

  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      startRound(0, []);
    }
    return () => player.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = round ? round.track.lyrics!.lines[round.line].text : "";
  const prev = round ? round.track.lyrics!.lines[round.line - 1]?.text : "";
  const paidHints = round ? round.hints.filter((h) => !(h === "prev" && !round.aligned)).length : 0;
  const multiplier = Math.pow(HINT_COST, paidHints);
  const done = round?.similarity != null;

  function submit(guess: string) {
    if (!round || done) return;
    stop();
    const sim = lineSimilarity(guess, answer);
    const credit = sim >= 0.9 ? 1 : sim >= 0.35 ? sim : 0;
    const points = Math.round(settings.maxPoints * credit * multiplier);
    setRound({ ...round, guess, similarity: sim, points });
    setResults((r) => [
      ...r,
      { track: round.track, guesses: [], solved: sim >= 0.9, listened: round.clip, points, lyric: { line: answer, guess, similarity: sim, hints: paidHints } },
    ]);
  }

  function next() {
    if (!round) return;
    stop();
    if (round.index + 1 >= totalRounds) return onFinish(results);
    startRound(round.index + 1, results);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === " " && round && !done) {
        e.preventDefault();
        playing ? stop() : play(round.clip);
      } else if (e.key === "Enter" && done) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const words = lyricWords(answer);
  const available: Hint[] = round ? ((round.aligned ? ["prev", "first", "shape"] : ["first", "shape"]) as Hint[]).filter((h) => !round.hints.includes(h)) : [];

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-5 tabular">
      <GameHeader onQuit={onQuit} roundNo={Math.min((round?.index ?? 0) + 1, totalRounds)} totalRounds={totalRounds} score={score} done={results.length} current={!!round && !done} playing={playing} label="Line" />
      {banner}
      {loading || !round ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-2">
          <span className="text-[15px]">
            Finding a song with lyrics <Spinner />
          </span>
        </div>
      ) : !done ? (
        <div className="flex flex-1 flex-col">
          <section className="pt-7">
            <div className="text-[15px] text-ink-2">
              {cleanTitle(round.track.title)} · {round.track.artists.join(", ")}
            </div>
            <h1 className="mt-1 text-[40px] font-bold leading-[1.02] tracking-tight sm:text-[52px]">What&apos;s the next line?</h1>
            <p className="mt-2 text-[15px] text-ink-2">
              {round.aligned
                ? `Hear the ${Math.round(settings.lyricLead)} seconds before it, then type the line that comes next.`
                : "Here's the line before it. Type the one that comes next."}
            </p>
          </section>

          <div className="mt-6 border-t-2 border-ink pt-5">
            {round.hints.includes("prev") && prev && <p className="border-l-4 border-ink pl-4 text-[22px] font-semibold leading-snug">{prev}</p>}
            <p className={cx("mt-4 pl-5 text-[20px] leading-snug text-ink-3", !round.hints.includes("prev") && "mt-0")} aria-label="The missing line">
              {round.hints.includes("shape") ? (
                <span className="font-mono tracking-wider">
                  {round.hints.includes("first") ? `${answer.split(/\s+/)[0]}  ${lineShape(answer.split(/\s+/).slice(1).join(" "))}` : lineShape(answer)}
                </span>
              ) : round.hints.includes("first") ? (
                <span>
                  <span className="font-semibold text-ink">{answer.split(/\s+/)[0]}</span> …
                </span>
              ) : (
                <span>
                  … <span className="text-[15px]">({words.length} words)</span>
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => (playing ? stop() : play(round.clip))}
            className={cx("mt-6 flex h-14 items-center justify-center gap-2.5 text-[17px] font-bold transition-colors", playing ? "bg-signal text-white" : "bg-ink text-paper hover:bg-black")}
          >
            {playing ? <StopGlyph /> : <PlayGlyph />}
            {playing ? "Playing" : round.aligned ? `Play the ${Math.round(settings.lyricLead)}s before it` : "Play the song"}
            <Kbd>Space</Kbd>
          </button>
          {audioError && <p className="mt-2 text-sm text-error">{audioError}</p>}

          {available.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-5">
              {available.map((h) => (
                <Button key={h} variant="text" onClick={() => setRound({ ...round, hints: [...round.hints, h] })} className="text-sm">
                  {HINT_LABEL[h]} <span className="text-ink-3">−30%</span>
                </Button>
              ))}
            </div>
          )}

          <div className="min-h-6 flex-1" />
          <p className="mb-2 text-[15px] text-ink-2">
            Worth up to <span className="font-bold text-ink">{Math.round(settings.maxPoints * multiplier).toLocaleString()}</span>. Close counts: you score for every word you get in order.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) submit(text.trim());
            }}
          >
            <label htmlFor="lyric-guess" className="sr-only">
              The next line
            </label>
            <input
              id="lyric-guess"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === " " && !text) {
                  e.preventDefault();
                  playing ? stop() : play(round.clip);
                }
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Type the next line"
              className="h-14 w-full min-w-0 flex-1 border-2 border-ink bg-field px-3.5 text-[17px] text-ink outline-none placeholder:text-ink-3 focus:bg-white focus-visible:outline-none"
            />
            <button type="submit" disabled={!text.trim()} className="h-14 bg-ink px-5 text-base font-bold text-paper hover:bg-black disabled:opacity-30">
              Submit
            </button>
          </form>
          <div className="mt-1 flex justify-end">
            <button type="button" onClick={() => submit("")} className="h-11 text-[15px] text-ink-2 hover:text-ink">
              Give up
            </button>
          </div>
        </div>
      ) : (
        <LyricReveal round={round} prev={prev} answer={answer} playing={playing} onPlay={() => (playing ? stop() : play(round.aligned ? round.clip + 6 : 15))} onNext={next} isLast={round.index + 1 >= totalRounds} />
      )}
    </div>
  );
}

function LyricReveal({ round, prev, answer, playing, onPlay, onNext, isLast }: { round: RoundState; prev: string; answer: string; playing: boolean; onPlay: () => void; onNext: () => void; isLast: boolean }) {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  const sim = round.similarity ?? 0;
  const marked = markWords(round.guess ?? "", answer);
  return (
    <div className="animate-rise flex flex-1 flex-col">
      <section className="pt-7" aria-live="polite">
        <div className="text-[15px] text-ink-2">{sim >= 0.9 ? "Word for word" : sim >= 0.35 ? `${Math.round(sim * 100)}% of the words` : round.guess ? "Not quite" : "Gave up"}</div>
        <div className={cx("numeral text-[112px] leading-[0.85] sm:text-[128px]", !round.points && "text-ink-3")}>
          {round.points ? "+" : ""}
          {(round.points ?? 0).toLocaleString()}
        </div>
      </section>
      <div className="mt-6 border-t-2 border-ink pt-5">
        {prev && <p className="border-l-4 border-rule-strong pl-4 text-[17px] leading-snug text-ink-2">{prev}</p>}
        <p className="mt-3 border-l-4 border-ink pl-4 text-[22px] leading-snug">
          {marked.map((w, i) => (
            <span key={i} className={w.hit ? "font-bold" : "text-ink-2 underline decoration-error decoration-2 underline-offset-4"}>
              {w.word}{" "}
            </span>
          ))}
        </p>
        {round.guess && <p className="mt-3 pl-5 text-[15px] text-ink-2">You wrote: {round.guess}</p>}
      </div>
      <div className="mt-6">
        <TrackCard t={round.track} />
      </div>
      <div className="min-h-8 flex-1" />
      <Button onClick={onPlay} className="h-[52px] text-base">
        {playing ? <StopGlyph /> : <PlayGlyph />}
        {playing ? "Stop" : round.aligned ? "Hear it" : "Hear the song"}
      </Button>
      <button ref={nextRef} type="button" onClick={onNext} className="mt-2 flex h-14 items-center justify-between bg-ink px-5 text-[17px] font-bold text-paper hover:bg-black">
        {isLast ? "See results" : "Next line"}
        <Kbd>Enter</Kbd>
      </button>
    </div>
  );
}
