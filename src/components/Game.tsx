"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerField, GameSettings, Guess, RoundResult, Track } from "@/lib/types";
import type { SnippetPlayer } from "@/lib/player";
import { isIOS, type ActiveTwist } from "@/lib/audio";
import { pointsFor, formatSeconds } from "@/lib/scoring";
import { cleanTitle } from "@/lib/text";
import { rng } from "@/lib/random";
import { FIELD_INFO, TWIST_INFO, answerText, checkText, formatCount, formatMonth, grade, roundTwist } from "@/lib/modes";
import { ensureExtras } from "@/lib/extras";
import { AlbumInput, ArtistInput, GuessInput, type GuessValue } from "./GuessInput";
import { ChoiceInput, CountInput, MonthInput, YearInput } from "./AnswerInputs";
import { SnippetBar } from "./SnippetBar";
import { Button, Kbd, Spinner, cx } from "./ui";
import { ShortcutHelp, useShortcuts, type Shortcut } from "./Shortcuts";

export interface TrackSource {
  all: Track[];
  next(): Promise<Track | null>;
}

interface FieldState {
  field: AnswerField;
  status: "open" | "right" | "close" | "wrong";
  /** Points earned (before penalties). */
  points: number;
  penalty: number;
  guess?: string;
  detail?: string;
  at?: number;
}

interface RoundState {
  index: number;
  track: Track;
  step: number;
  guesses: Guess[];
  status: "guessing" | "won" | "lost";
  points: number;
  fields: FieldState[];
  twist: ActiveTwist;
}

interface Props {
  source: TrackSource;
  player: SnippetPlayer;
  settings: GameSettings;
  totalRounds: number;
  seed: number;
  /** Playlists in this game, for "which playlist" rounds. */
  playlistOptions?: string[];
  banner?: React.ReactNode;
  onFinish: (results: RoundResult[], note?: string) => void;
  onQuit: () => void;
}

/** Splits "1.5s" into its number and unit so the unit can be set smaller. */
export function Timecode({ seconds, className, unitClassName }: { seconds: number; className?: string; unitClassName?: string }) {
  const text = formatSeconds(seconds);
  return (
    <span className={cx("numeral leading-[0.85]", className)}>
      {text.slice(0, -1)}
      <span className={cx("tracking-normal", unitClassName)}>s</span>
    </span>
  );
}

export const PlayGlyph = () => (
  <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
    <path d="M3 1.5v11l9.5-5.5z" />
  </svg>
);
export const StopGlyph = () => (
  <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
    <rect x="2" y="2" width="10" height="10" />
  </svg>
);

/** Shared header: quit, round counter, score, round segments. */
export function GameHeader({ onQuit, roundNo, totalRounds, score, done, current, playing, label, endless }: { onQuit: () => void; roundNo: number; totalRounds: number; score: number; done: number; current: boolean; playing: boolean; label?: string; endless?: boolean }) {
  const showSegments = !endless && totalRounds <= 30;
  return (
    <>
      <header className="grid h-14 grid-cols-[1fr_auto_1fr] items-center">
        <button type="button" onClick={onQuit} className="h-11 justify-self-start text-[15px] text-ink-2 hover:text-ink">
          Quit
        </button>
        <span className="text-[15px] font-semibold condensed">
          {label ?? "Round"} {roundNo} {!endless && <span className="font-medium text-ink-3">of {totalRounds}</span>}
        </span>
        <span className="justify-self-end text-[15px]">
          <span className="font-bold">{score < 0 ? `−${Math.abs(score).toLocaleString()}` : score.toLocaleString()}</span> <span className="text-ink-3">pts</span>
        </span>
      </header>
      {showSegments ? (
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${totalRounds}, minmax(0, 1fr))` }} aria-hidden>
          {Array.from({ length: totalRounds }, (_, i) => (
            <span key={i} className={cx("h-1", i < done ? "bg-ink" : i === done && current ? (playing ? "bg-signal" : "bg-ink-3") : "bg-rule")} />
          ))}
        </div>
      ) : endless ? (
        <div className="h-1 bg-ink" aria-hidden />
      ) : (
        <div className="h-1 bg-rule" aria-hidden>
          <div className="h-full bg-ink transition-[width]" style={{ width: `${(done / totalRounds) * 100}%` }} />
        </div>
      )}
    </>
  );
}

/** Keeps playback state + the progress animation for a SnippetPlayer. */
export function usePlayback(player: SnippetPlayer) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const cancel = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };
  const tick = useCallback(() => {
    setElapsed(player.elapsed());
    rafRef.current = requestAnimationFrame(tick);
  }, [player]);
  // Safari only starts audio from a user gesture: unlock on every tap/keypress during the game.
  useEffect(() => {
    const unlock = () => player.unlock();
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, [player]);
  const play = useCallback(
    async (seconds: number) => {
      player.unlock();
      cancel();
      setPlaying(true);
      setError(null);
      try {
        await player.play(seconds, () => {
          setPlaying(false);
          setElapsed(null);
          cancel();
        });
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        setPlaying(false);
        setError((e as Error).message);
      }
    },
    [player, tick],
  );
  const stop = useCallback(() => {
    player.stop();
    setPlaying(false);
    setElapsed(null);
    cancel();
  }, [player]);
  useEffect(() => () => cancel(), []);
  return { playing, elapsed, error, setError, play, stop };
}

export function Game({ source, player, settings, totalRounds, seed, playlistOptions = [], banner, onFinish, onQuit }: Props) {
  const [round, setRound] = useState<RoundState | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [shake, setShake] = useState(0);
  const { playing, elapsed, error: audioError, setError: setAudioError, play: playLen, stop } = usePlayback(player);
  const nextRef = useRef<Promise<Track | null> | null>(null);
  const failures = useRef(0);
  const steps = settings.steps;
  const last = steps.length - 1;
  const score = results.reduce((a, r) => a + r.points, 0);
  const fieldsAsked = settings.fields.length ? settings.fields : (["title"] as AnswerField[]);
  const multi = !(fieldsAsked.length === 1 && fieldsAsked[0] === "title");

  const fetchPlayable = useCallback(async (): Promise<Track | null> => {
    for (let i = 0; i < 25; i++) {
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
        return startRound(index, prior);
      }
      failures.current = 0;
      const twist = player.canTwist ? roundTwist(settings.twist, rng(seed * 31 + index)) : "none";
      player.setTwist(twist);
      setRound({
        index,
        track: t,
        step: 0,
        guesses: [],
        status: "guessing",
        points: 0,
        twist,
        fields: fieldsAsked.map((field) => ({ field, status: "open", points: 0, penalty: 0 })),
      });
      setLoading(false);
      if (index + 1 < totalRounds) nextRef.current = fetchPlayable();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchPlayable, onFinish, player, seed, totalRounds, settings.twist],
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

  const play = useCallback((seconds?: number) => round && playLen(seconds ?? steps[round.step]), [round, playLen, steps]);
  const toggle = () => (playing ? stop() : play());

  /** Apply new field states; if nothing is open any more, the round is over. */
  function settle(r: RoundState, fields: FieldState[], guesses: Guess[], step: number) {
    if (fields.some((f) => f.status === "open")) {
      setRound({ ...r, fields, guesses, step });
      return;
    }
    stop();
    player.setTwist("none");
    const points = fields.reduce((a, f) => a + f.points - f.penalty, 0);
    const won = fields.every((f) => f.status === "right");
    const done: RoundState = { ...r, fields, guesses, step, points, status: won || fields.some((f) => f.points > 0) ? "won" : "lost" };
    setRound(done);
    const listened = steps[step];
    setResults((prev) => [
      ...prev,
      {
        track: r.track,
        guesses,
        solved: won,
        listened,
        points,
        twist: r.twist,
        fields: fields.map((f) => ({
          field: f.field,
          outcome: f.status === "open" ? "wrong" : f.status,
          points: f.points - f.penalty,
          guess: f.guess,
          answer: answerText(f.field, r.track),
          detail: f.detail,
          at: f.at,
        })),
      },
    ]);
  }

  const label = (f: AnswerField) => (multi ? `${FIELD_INFO[f].short}: ` : "");

  function submitText(field: "title" | "artist" | "album", value: string, artist?: string) {
    const r = round;
    if (!r || r.status !== "guessing") return;
    const f = r.fields.find((x) => x.field === field);
    if (!f || f.status !== "open") return;
    const ok = checkText(field, value, r.track, { guessArtist: artist, strictArtist: settings.strictArtist });
    const at = steps[r.step];
    const guesses = [...r.guesses, { text: label(field) + (artist ? `${value} · ${artist}` : value), artist, correct: ok, at }];
    let step = r.step;
    let fields = r.fields.map((x) => (x.field !== field ? x : ok ? { ...x, status: "right" as const, points: pointsFor(at, settings), guess: value, at } : { ...x, penalty: x.penalty + settings.wrongPenalty, guess: value }));
    if (!ok) {
      setShake((n) => n + 1);
      if (settings.wrongUnlocks) {
        if (step >= last) fields = fields.map((x) => (x.field === field ? { ...x, status: "wrong" as const, at } : x));
        else step += 1;
      }
    }
    settle(r, fields, guesses, step);
  }

  function submitGraded(field: "year" | "plays" | "myplays" | "added", value: number, shown: string) {
    const r = round;
    if (!r || r.status !== "guessing") return;
    const at = steps[r.step];
    const g = grade(field, value, r.track);
    const credit = g?.credit ?? 0;
    const pts = Math.round(pointsFor(at, settings) * credit);
    const status = credit >= 0.999 ? ("right" as const) : pts > 0 ? ("close" as const) : ("wrong" as const);
    const guesses = [...r.guesses, { text: `${label(field)}${shown}${g ? ` (${g.detail})` : ""}`, correct: status === "right", at }];
    const fields = r.fields.map((x) => (x.field === field ? { ...x, status, points: pts, guess: shown, detail: g?.detail, at } : x));
    if (status !== "right") setShake((n) => n + 1);
    settle(r, fields, guesses, r.step);
  }

  function submitChoice(option: string) {
    const r = round;
    if (!r || r.status !== "guessing") return;
    const at = steps[r.step];
    const ok = !!r.track.playlists?.includes(option);
    const guesses = [...r.guesses, { text: `${label("playlist")}${option}`, correct: ok, at }];
    const fields = r.fields.map((x) =>
      x.field === "playlist" ? (ok ? { ...x, status: "right" as const, points: pointsFor(at, settings), guess: option, at } : { ...x, status: "wrong" as const, penalty: settings.wrongPenalty, guess: option, at }) : x,
    );
    if (!ok) setShake((n) => n + 1);
    settle(r, fields, guesses, r.step);
  }

  function skip() {
    const r = round;
    if (!r || r.status !== "guessing") return;
    const guesses = [...r.guesses, { text: "Skipped", skipped: true, correct: false, at: steps[r.step] }];
    if (r.step >= last) return settle(r, r.fields.map((f) => (f.status === "open" ? { ...f, status: "wrong" as const } : f)), guesses, r.step);
    const step = r.step + 1;
    setRound({ ...r, step, guesses });
    setTimeout(() => playLen(steps[step]), 0);
  }

  function giveUp() {
    const r = round;
    if (!r || r.status !== "guessing") return;
    settle(r, r.fields.map((f) => (f.status === "open" ? { ...f, status: "wrong" as const } : f)), [...r.guesses, { text: "Gave up", skipped: true, correct: false, at: steps[r.step] }], r.step);
  }

  function nextRound() {
    if (!round) return;
    stop();
    if (round.index + 1 >= totalRounds) return onFinish(results);
    startRound(round.index + 1, results);
  }

  const guessing = !!round && !loading && round.status === "guessing";
  const roundDone = !!round && !loading && round.status !== "guessing";
  const playlistOpen = guessing && round!.fields.some((f) => f.field === "playlist" && f.status === "open");
  const focusAnswer = () => document.querySelector<HTMLElement>("[data-answers] input:not([disabled]), [data-answers] select")?.focus();
  const shortcuts: Shortcut[] = [
    { keys: [" "], display: "Space", label: "Play or stop the snippet", run: toggle, enabled: guessing },
    { keys: [" "], display: "Space", label: `Hear ${formatSeconds(steps[last])} of the song`, run: () => (playing ? stop() : play(steps[last])), enabled: roundDone },
    { keys: ["s"], display: "S / Shift Enter", label: "Skip to the next length", run: skip, enabled: guessing },
    { keys: ["Enter"], shift: true, typing: true, display: "Shift Enter", label: "Skip", run: skip, enabled: guessing, hidden: true },
    { keys: ["g"], display: "G", label: "Give up this round", run: giveUp, enabled: guessing },
    { keys: ["/"], display: "/", label: "Jump to the answer box", run: focusAnswer, enabled: guessing },
    { keys: ["Escape"], typing: true, display: "Esc", label: "Leave the answer box", run: () => (document.activeElement as HTMLElement | null)?.blur(), enabled: guessing },
    { keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], display: "1 – 9", label: "Pick a playlist", run: (k) => playlistOptions[+k - 1] && submitChoice(playlistOptions[+k - 1]), enabled: playlistOpen },
    { keys: ["Enter"], display: "Enter", label: round && round.index + 1 >= totalRounds ? "See results" : "Next song", run: nextRound, enabled: roundDone },
  ];
  const { help, setHelp } = useShortcuts(shortcuts);

  const penalties = round ? round.fields.reduce((a, f) => a + f.penalty, 0) : 0;
  const openCount = round ? round.fields.filter((f) => f.status === "open").length : 0;
  const potential = round ? pointsFor(steps[round.step], settings) - (multi ? 0 : penalties) : 0;
  const roundNo = Math.min((round?.index ?? 0) + 1, totalRounds);
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(isIOS()), []);
  const earliestYear = Math.min(2008, ...source.all.map((t) => (t.addedAt ? new Date(t.addedAt).getUTCFullYear() : 9999)));

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-5 tabular">
      <GameHeader onQuit={onQuit} roundNo={roundNo} totalRounds={totalRounds} score={score} done={results.length} current={round?.status === "guessing"} playing={playing} />
      <ShortcutHelp open={help} onClose={() => setHelp(false)} shortcuts={shortcuts} />
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
          <section className={cx("text-center", multi ? "pt-5 sm:pt-7" : "pt-7 sm:pt-10")} aria-live="polite">
            <div className="text-[15px] text-ink-2">You have</div>
            <Timecode seconds={steps[round.step]} className={cx("block", multi ? "text-[104px] sm:text-[136px]" : "text-[136px] sm:text-[168px]")} unitClassName={multi ? "text-[42px] sm:text-[52px]" : "text-[52px] sm:text-[64px]"} />
            <div className="mt-2.5 text-[15px] text-ink-2">
              {multi ? (
                <>
                  Each answer worth <span className="font-bold text-ink">{potential.toLocaleString()}</span> now · {openCount} to go
                </>
              ) : (
                <>
                  Worth <span className={cx("font-bold", potential > 0 ? "text-ink" : "text-error")}>{potential.toLocaleString()}</span> if you get it now
                </>
              )}
            </div>
            {round.twist !== "none" && (
              <div className="mt-2 inline-block border border-ink px-2 py-0.5 text-[13px] font-semibold uppercase tracking-wider">{TWIST_INFO[round.twist].label}</div>
            )}
          </section>

          <div className="pt-5">
            <SnippetBar steps={steps} unlocked={round.step} elapsed={elapsed} settings={settings} />
          </div>

          <button
            type="button"
            onClick={toggle}
            className={cx("mt-5 flex h-14 items-center justify-center gap-2.5 text-[17px] font-bold transition-colors", playing ? "bg-signal text-white" : "bg-ink text-paper hover:bg-black")}
          >
            {playing ? <StopGlyph /> : <PlayGlyph />}
            {playing ? `Playing ${formatSeconds(steps[round.step])}` : `Play ${formatSeconds(steps[round.step])}`}
            <Kbd>Space</Kbd>
          </button>
          {audioError && <p className="mt-2 text-sm text-error">{audioError}</p>}
          <p className="mt-2 text-center text-[13px] text-ink-3">Plays from {player.startLabel()}</p>
          {ios && round.index === 0 && round.guesses.length === 0 && <p className="mt-1 text-center text-[13px] text-ink-2">No sound? Turn the volume up and check the ring/silent switch.</p>}

          {multi ? (
            <AnswerSheet
              round={round}
              settings={settings}
              pool={source.all}
              playlistOptions={playlistOptions}
              earliestYear={earliestYear}
              shake={shake}
              onText={submitText}
              onGraded={submitGraded}
              onChoice={submitChoice}
              onEmptySpace={toggle}
            />
          ) : (
            <>
              {round.guesses.length > 0 && <GuessLog guesses={round.guesses} penalty={settings.wrongPenalty} />}
              <div className="min-h-6 flex-1" />
              <div data-answers>
                <GuessInput pool={source.all} scope={settings.answerScope} onGuess={(g: GuessValue) => submitText("title", g.title, g.artist)} onEmptySpace={toggle} shake={shake} />
              </div>
            </>
          )}

          <div className="mt-1 flex items-center justify-between">
            <button type="button" onClick={skip} className="inline-flex h-11 items-center gap-2 text-[15px] font-semibold hover:text-ink-2">
              {round.step < last ? `Skip to ${formatSeconds(steps[round.step + 1])}` : "Give up"} <Kbd>S</Kbd>
            </button>
            {round.step < last && (
              <button type="button" onClick={giveUp} className="inline-flex h-11 items-center gap-2 text-[15px] text-ink-2 hover:text-ink">
                Give up <Kbd>G</Kbd>
              </button>
            )}
          </div>
          <p className="hidden text-center text-[13px] text-ink-3 sm:block">
            Space plays · Shift+Enter skips while typing · / jumps to the answer ·{" "}
            <button type="button" onClick={() => setHelp(true)} className="underline decoration-rule-strong underline-offset-2 hover:text-ink">
              ? all shortcuts
            </button>
          </p>
        </div>
      ) : (
        <Reveal round={round} settings={settings} multi={multi} onPlay={() => (playing ? stop() : play(steps[last]))} playing={playing} onNext={nextRound} isLast={round.index + 1 >= totalRounds} />
      )}
    </div>
  );
}

function AnswerSheet({
  round,
  settings,
  pool,
  playlistOptions,
  earliestYear,
  shake,
  onText,
  onGraded,
  onChoice,
  onEmptySpace,
}: {
  round: RoundState;
  settings: GameSettings;
  pool: Track[];
  playlistOptions: string[];
  earliestYear: number;
  shake: number;
  onText: (f: "title" | "artist" | "album", v: string, artist?: string) => void;
  onGraded: (f: "year" | "plays" | "myplays" | "added", v: number, shown: string) => void;
  onChoice: (o: string) => void;
  onEmptySpace: () => void;
}) {
  const asksArtist = round.fields.some((f) => f.field === "artist");
  return (
    <div className="mt-6 border-t-2 border-ink" data-answers>
      {round.fields.map((f) => {
        const info = FIELD_INFO[f.field];
        return (
          <div key={f.field} className="border-b border-rule py-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-bold uppercase tracking-wider">{info.label}</span>
              {f.status === "open" ? (
                f.penalty > 0 ? <span className="text-[13px] font-semibold text-error">&minus;{f.penalty}</span> : null
              ) : (
                <span className={cx("text-[13px] font-bold", f.points - f.penalty < 0 && "text-error", f.status === "wrong" && f.points - f.penalty === 0 && "text-ink-3")}>
                  {f.points - f.penalty > 0 ? "+" : f.points - f.penalty < 0 ? "−" : ""}
                  {Math.abs(f.points - f.penalty).toLocaleString()}
                </span>
              )}
            </div>
            {f.status !== "open" ? (
              <div className="flex items-center gap-2 text-[15px]">
                <span className={cx("font-semibold", f.status === "wrong" && "text-ink-2 line-through")}>{f.guess ?? "No answer"}</span>
                {f.detail && <span className="text-ink-2">· {f.detail}</span>}
              </div>
            ) : f.field === "title" ? (
              <GuessInput id="guess-title" compact hideArtist={asksArtist} pool={pool} scope={settings.answerScope} onGuess={(g) => onText("title", g.title, asksArtist ? undefined : g.artist)} onEmptySpace={onEmptySpace} shake={shake} />
            ) : f.field === "artist" ? (
              <ArtistInput pool={pool} scope={settings.answerScope} onGuess={(v) => onText("artist", v)} onEmptySpace={onEmptySpace} shake={shake} />
            ) : f.field === "album" ? (
              <AlbumInput pool={pool} scope={settings.answerScope} onGuess={(v) => onText("album", v)} onEmptySpace={onEmptySpace} shake={shake} />
            ) : f.field === "year" ? (
              <YearInput onSubmit={(y) => onGraded("year", y, String(y))} onEmptySpace={onEmptySpace} />
            ) : f.field === "plays" ? (
              <CountInput id="guess-plays" label="Total plays" placeholder="Plays, e.g. 2.5m or 300k" onSubmit={(n) => onGraded("plays", n, formatCount(n))} onEmptySpace={onEmptySpace} />
            ) : f.field === "myplays" ? (
              <CountInput id="guess-myplays" label="Your plays" placeholder="How many times you've played it" onSubmit={(n) => onGraded("myplays", n, `${n.toLocaleString()} plays`)} onEmptySpace={onEmptySpace} />
            ) : f.field === "added" ? (
              <MonthInput minYear={earliestYear} onSubmit={(m) => onGraded("added", m, formatMonth(new Date(Date.UTC(Math.floor(m / 12), m % 12, 15)).toISOString()))} />
            ) : (
              <ChoiceInput options={playlistOptions} onPick={onChoice} />
            )}
          </div>
        );
      })}
      <div className="min-h-4 flex-1" />
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

export function TrackCard({ t, extra }: { t: Track; extra?: React.ReactNode }) {
  const meta = [t.year ?? (t.decade ? `${t.decade}s` : null), t.album ? cleanTitle(t.album) : null, t.sourceLabel].filter(Boolean).join(" · ");
  return (
    <article className="grid grid-cols-[112px_minmax(0,1fr)] items-end gap-4 border-t-2 border-ink pt-5 sm:grid-cols-[140px_minmax(0,1fr)]">
      {t.image ? <img src={t.image} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square w-full bg-paper-2" />}
      <div className="min-w-0">
        <h2 className="text-[26px] font-bold leading-[1.05] tracking-tight sm:text-3xl">{cleanTitle(t.title)}</h2>
        <div className="mt-1.5 text-[17px]">{t.artists.join(", ")}</div>
        {meta && <div className="mt-1 text-[13px] text-ink-2">{meta}</div>}
        {extra}
      </div>
    </article>
  );
}

function Reveal({ round, settings, multi, onPlay, playing, onNext, isLast }: { round: RoundState; settings: GameSettings; multi: boolean; onPlay: () => void; playing: boolean; onNext: () => void; isLast: boolean }) {
  const t = round.track;
  const title = round.fields[0];
  const won = multi ? round.points > 0 : title.status === "right";
  const wrong = round.guesses.filter((g) => !g.correct && !g.skipped).length;
  const nextRef = useRef<HTMLButtonElement>(null);
  // Enter and Space are handled as shortcuts, so just make sure focus isn't left on a removed input.
  useEffect(() => (document.activeElement as HTMLElement | null)?.blur(), []);
  const solvedAt = settings.steps[round.step];
  const full = settings.steps[settings.steps.length - 1];
  const rightCount = round.fields.filter((f) => f.status === "right").length;
  return (
    <div className="animate-rise flex flex-1 flex-col">
      <section className="flex items-end justify-between gap-3 pt-7" aria-live="polite">
        <div>
          <div className="text-[15px] text-ink-2">
            {multi ? `${rightCount} of ${round.fields.length} right` : won ? `Got it at ${formatSeconds(solvedAt)}` : "Not this time"}
            {round.twist !== "none" && ` · ${TWIST_INFO[round.twist].label.toLowerCase()}`}
          </div>
          <div className={cx("numeral text-[112px] leading-[0.85] sm:text-[128px]", round.points < 0 ? "text-error" : round.points === 0 ? "text-ink-3" : "")}>
            {round.points > 0 ? "+" : round.points < 0 ? "−" : ""}
            {Math.abs(round.points).toLocaleString()}
          </div>
        </div>
        {!multi && (won || wrong > 0) && (
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

      <div className="mt-7">
        <TrackCard t={t} />
      </div>

      {multi ? (
        <dl className="mt-4">
          {round.fields.map((f) => (
            <div key={f.field} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-rule py-2.5 text-[15px]">
              <dt className="min-w-0">
                <span className="block text-[13px] font-bold uppercase tracking-wider">{FIELD_INFO[f.field].label}</span>
                <span className="block font-semibold">{answerText(f.field, t)}</span>
                {f.status !== "right" && (
                  <span className="block text-sm text-ink-2">
                    {f.guess ? `You said ${f.guess}` : "No answer"}
                    {f.detail && f.detail !== "exact" ? ` · ${f.detail}` : ""}
                  </span>
                )}
              </dt>
              <dd className={cx("self-center font-bold", f.points - f.penalty < 0 ? "text-error" : f.points - f.penalty === 0 && "text-ink-3")}>
                {f.points - f.penalty > 0 ? "+" : f.points - f.penalty < 0 ? "−" : ""}
                {Math.abs(f.points - f.penalty).toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        round.guesses.length > 0 && <GuessLog guesses={round.guesses} penalty={settings.wrongPenalty} showCorrect />
      )}

      <div className="min-h-8 flex-1" />

      <Button onClick={onPlay} className="h-[52px] text-base">
        {playing ? <StopGlyph /> : <PlayGlyph />}
        {playing ? "Stop" : `Hear ${formatSeconds(full)}`}
        <Kbd>Space</Kbd>
      </Button>
      <button ref={nextRef} type="button" onClick={onNext} className="mt-2 flex h-14 items-center justify-between bg-ink px-5 text-[17px] font-bold text-paper hover:bg-black">
        {isLast ? "See results" : "Next song"}
        <Kbd>Enter</Kbd>
      </button>
    </div>
  );
}
