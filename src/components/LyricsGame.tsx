"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameSettings, RoundResult, Track } from "@/lib/types";
import type { SnippetPlayer } from "@/lib/player";
import { rng } from "@/lib/random";
import { ensureExtras } from "@/lib/extras";
import { cleanTitle } from "@/lib/text";
import { lineShape, lineSimilarity, lyricWords, markWords, pickLine } from "@/lib/lyrics";
import { GameHeader, PlayGlyph, StopGlyph, usePlayback, type TrackSource } from "./Game";
import { Button, cx } from "./ui";
import { Rolling } from "./motion";
import { LoadingNotes } from "./StatusScreen";
import { ShortcutHelp, modKey, useShortcuts, type Shortcut } from "./Shortcuts";

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

  const available: Hint[] = round ? ((round.aligned ? ["prev", "first", "shape"] : ["first", "shape"]) as Hint[]).filter((h) => !round.hints.includes(h)) : [];
  const guessing = !!round && !loading && !done;
  const shortcuts: Shortcut[] = [
    { keys: [" "], display: "Space", label: round?.aligned ? "Play the seconds before the line" : "Play the song", run: () => round && (playing ? stop() : play(round.clip)), enabled: guessing },
    { keys: [" "], display: "Space", label: "Hear it", run: () => round && (playing ? stop() : play(round.aligned ? round.clip + 6 : 15)), enabled: !!round && done },
    { keys: ["h"], display: "H", label: "Take the next hint", run: () => round && available.length && setRound({ ...round, hints: [...round.hints, available[0]] }), enabled: guessing },
    { keys: ["/"], display: "/", label: "Jump to the answer box", run: () => document.getElementById("lyric-guess")?.focus(), enabled: guessing },
    { keys: ["Escape"], typing: true, display: "Esc", label: "Leave the answer box", run: () => (document.activeElement as HTMLElement | null)?.blur(), enabled: guessing },
    { keys: ["g"], display: "G", label: "Give up this line", run: () => submit(""), enabled: guessing },
    { keys: ["Enter"], display: "Enter", label: round && round.index + 1 >= totalRounds ? "See results" : "Next line", run: next, enabled: !!round && done },
    { keys: ["Enter"], mod: true, typing: true, display: `${modKey()} Enter`, label: "Submit", run: () => text.trim() && submit(text.trim()), enabled: guessing, hidden: true },
    { keys: ["Enter"], mod: true, display: `${modKey()} Enter`, label: round && round.index + 1 >= totalRounds ? "See results" : "Next line", run: next, enabled: !!round && done, hidden: true },
  ];
  const { help, setHelp } = useShortcuts(shortcuts);

  const words = lyricWords(answer);
  const worth = Math.round(settings.maxPoints * multiplier);
  const playLabel = round?.aligned ? `Play the ${Math.round(settings.lyricLead)}s before it` : "Play the song";

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-6 sm:px-10 tabular">
      <GameHeader onQuit={onQuit} roundNo={Math.min((round?.index ?? 0) + 1, totalRounds)} totalRounds={totalRounds} score={score} done={results.length} current={!!round && !done} playing={playing} label="Line" />
      <ShortcutHelp open={help} onClose={() => setHelp(false)} shortcuts={shortcuts} />
      <main className="mx-auto flex w-full max-w-[952px] flex-1 flex-col">
      {banner}
      {loading || !round ? (
        <div className="flex flex-1 items-center justify-center pb-24">
          <LoadingNotes message="Finding a song with lyrics" />
        </div>
      ) : !done ? (
        <div className="flex flex-1 flex-col justify-center pb-10 pt-4 sm:pb-16">
          <section className="text-center">
            <p className="hand text-[88px] leading-[0.95] text-blue sm:text-[120px]">
              <span className="sr-only">Worth </span>
              {worth.toLocaleString()}
              <span className="sr-only"> points</span>
            </p>
            <p className="mt-3 text-[17px] text-ink-3">
              {cleanTitle(round.track.title)} · {round.track.artists.join(", ")}
            </p>
          </section>

          <div className="mt-10 text-center text-[26px] leading-snug sm:text-[32px]">
            {round.hints.includes("prev") && prev && <p className="font-medium text-ink">{prev}</p>}
            <p className={cx("text-ink-3", round.hints.includes("prev") && prev && "mt-2")} aria-label="The missing line">
              {round.hints.includes("shape") ? (
                <span className="font-mono text-[0.85em] tracking-wider">
                  {round.hints.includes("first") ? `${answer.split(/\s+/)[0]}  ${lineShape(answer.split(/\s+/).slice(1).join(" "))}` : lineShape(answer)}
                </span>
              ) : round.hints.includes("first") ? (
                <span>
                  <span className="font-medium text-ink">{answer.split(/\s+/)[0]}</span> …
                </span>
              ) : (
                <span>
                  … <span className="text-[17px]">{words.length} words</span>
                </span>
              )}
            </p>
          </div>

          <form
            className="mt-10 flex items-center gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) submit(text.trim());
            }}
          >
            <button
              type="button"
              onClick={() => (playing ? stop() : play(round.clip))}
              aria-label={playing ? "Stop" : playLabel}
              title={playing ? "Stop" : playLabel}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-red text-paper transition-[background-color,transform] hover:bg-[#9e2c2c] active:scale-95 sm:h-16 sm:w-16"
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
                  <rect x="5" y="5" width="14" height="14" rx="1.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor" aria-hidden>
                  <path d="M6 3.5v17l15-8.5z" />
                </svg>
              )}
            </button>
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
              className="h-14 w-full min-w-0 flex-1 rounded-xl border-2 border-ink bg-field px-5 text-[19px] text-ink caret-red outline-none transition-shadow placeholder:text-ink-3 focus:ring-4 focus:ring-blue/20 focus-visible:outline-none sm:h-16 sm:text-[20px]"
            />
          </form>
          {audioError && <p className="mt-3 text-[15px] text-red">{audioError}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            {available.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setRound({ ...round, hints: [...round.hints, h] })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] border-ink px-4 text-[15px] font-semibold text-ink transition-colors hover:bg-card"
              >
                {HINT_LABEL[h]} <span className="font-medium text-ink-3">−30%</span>
              </button>
            ))}
            <Button variant="text" onClick={() => submit("")} className="ml-auto text-[16px] font-medium!">
              Give up
            </Button>
          </div>
        </div>
      ) : (
        <LyricReveal round={round} prev={prev} answer={answer} playing={playing} onPlay={() => (playing ? stop() : play(round.aligned ? round.clip + 6 : 15))} onNext={next} isLast={round.index + 1 >= totalRounds} />
      )}
      </main>
    </div>
  );
}

function LyricReveal({ round, prev, answer, playing, onPlay, onNext, isLast }: { round: RoundState; prev: string; answer: string; playing: boolean; onPlay: () => void; onNext: () => void; isLast: boolean }) {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus({ preventScroll: true }), []);
  const t = round.track;
  const sim = round.similarity ?? 0;
  const points = round.points ?? 0;
  const title = cleanTitle(t.title);
  const marked = markWords(round.guess ?? "", answer);
  const verdict = sim >= 0.9 ? "Word for word" : sim >= 0.35 ? `${Math.round(sim * 100)}%` : round.guess ? "Not quite" : "Gave up";
  const meta = [t.artists.join(", "), t.year ?? (t.decade ? `${t.decade}s` : null)].filter(Boolean).join(" · ");
  const won = points > 0;
  return (
    <div className="flex flex-1 flex-col justify-center pb-6 pt-4 sm:pb-16 sm:pt-8">
      <div className="grid items-center justify-items-center gap-5 text-center sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)] sm:justify-items-stretch sm:gap-[64px] sm:text-left">
        <div className={cx("w-[min(170px,44vw,20dvh)] sm:w-full", won ? "cover-pop" : "cover-drop")}>
          {t.image ? <img src={t.image} alt="" className="aspect-square w-full rounded-[6px] object-cover shadow-[0_18px_40px_-20px_rgb(30_30_30/0.5)]" /> : <div className="aspect-square w-full rounded-[6px] bg-paper-2" />}
        </div>
        <section className="min-w-0" aria-live="polite">
          <p className={cx("hand text-[64px] leading-[0.95] sm:text-[112px]", won ? "text-blue" : "text-ink-3")}>
            <Rolling value={points} from={0} delay={220} duration={750} format={(n) => (n > 0 ? `+${n.toLocaleString()}` : "0")} />
            <span className="sr-only"> points</span>
          </p>
          <p style={{ animationDelay: "100ms" }} className="rise-in text-[15px] font-semibold uppercase tracking-[0.12em] text-ink-3">{verdict}</p>
          <h2 style={{ animationDelay: "140ms" }} className={cx("rise-in hand mt-1 break-words leading-[1.05]", title.length > 28 ? "text-[28px] sm:text-[42px]" : "text-[34px] sm:text-[52px]")}>{title}</h2>
          {meta && <p style={{ animationDelay: "180ms" }} className="rise-in mt-1 text-[17px] text-ink-2 sm:text-[20px]">{meta}</p>}

          <div style={{ animationDelay: "240ms" }} className="rise-in mt-5 sm:mt-7">
            {prev && <p className="text-[16px] leading-snug text-ink-3 sm:text-[18px]">{prev}</p>}
            <p className="mt-1 text-[21px] leading-snug sm:text-[28px]">
              {marked.map((w, i) => (
                <span key={i} className={w.hit ? "font-semibold text-ink" : "text-ink-3 underline decoration-red decoration-2 underline-offset-[6px]"}>
                  {w.word}{" "}
                </span>
              ))}
            </p>
            {round.guess && <p className="mt-1.5 text-[15px] text-ink-3">You wrote: {round.guess}</p>}
          </div>

          <div style={{ animationDelay: "300ms" }} className="rise-in mt-6 flex flex-wrap items-center justify-center gap-3 sm:mt-8 sm:justify-start">
            <Button
              ref={nextRef}
              variant="primary"
              onClick={onNext}
              onKeyDown={(e) => {
                // Space plays the song on this screen, even with Next focused; ignore held-down Enter.
                if (e.key === " ") {
                  e.preventDefault();
                  if (!e.repeat) onPlay();
                } else if (e.key === "Enter" && e.repeat) e.preventDefault();
              }}
              onKeyUp={(e) => e.key === " " && e.preventDefault()}
            >
              {isLast ? "See results" : "Next line"}
            </Button>
            <Button onClick={onPlay}>
              {playing ? <StopGlyph /> : <PlayGlyph />}
              {playing ? "Stop" : round.aligned ? "Hear it" : "Hear the song"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
