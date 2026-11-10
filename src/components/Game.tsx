"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerField, GameSettings, Guess, RoundResult, Track } from "@/lib/types";
import type { SnippetPlayer } from "@/lib/player";
import type { ActiveTwist } from "@/lib/audio";
import { netPoints, pointsFor, formatSeconds } from "@/lib/scoring";
import { cleanTitle } from "@/lib/text";
import { rng } from "@/lib/random";
import { FIELD_INFO, TWIST_INFO, answerText, checkText, formatCount, formatMonth, grade, roundTwist } from "@/lib/modes";
import { ensureExtras } from "@/lib/extras";
import { STAGE_NAMES } from "@/lib/pool";
import { dlog } from "@/lib/dlog";
import { AlbumInput, ArtistInput, GuessInput, type GuessValue } from "./GuessInput";
import { ChoiceInput, CountInput, MonthInput, YearInput } from "./AnswerInputs";
import { Timeline, TIMELINE_HEIGHT, nextStop } from "./Timeline";
import { Glyph, NOTE_COLORS, type GlyphType } from "./notation";
import { Button, cx } from "./ui";
import { ShortcutHelp, modKey, useShortcuts, type Shortcut } from "./Shortcuts";
import { Rolling, isTextField, useKeyboard } from "./motion";

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
  /** Wrong guesses so far, shown struck through. */
  wrong: string[];
}

interface RoundState {
  index: number;
  track: Track;
  /** The playhead: how many seconds Play plays. */
  len: number;
  /** The longest clip played this round. */
  heard: number;
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

const CrossGlyph = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 12 12" className={cx("h-3 w-3 shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M2 2l8 8M10 2L2 10" />
  </svg>
);
const CheckGlyph = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" className={cx("h-4 w-4 shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5l3.2 3L13 4.5" />
  </svg>
);

/** Points as shown in Petaluma: 1,234 / -100 (Petaluma's hyphen is its minus), with an optional leading "+". */
function fmtPoints(n: number, sign = false) {
  const abs = Math.abs(n).toLocaleString();
  return n < 0 ? `-${abs}` : sign && n > 0 ? `+${abs}` : abs;
}

/** Shared HUD: quit, one oval per round, running score. */
export function GameHeader({ onQuit, roundNo, totalRounds, score, done, current, label, endless, stage }: { onQuit: () => void; roundNo: number; totalRounds: number; score: number; done: number; current: boolean; playing: boolean; label?: string; endless?: boolean; stage?: number }) {
  const name = `${label ?? "Round"} ${roundNo}${endless ? "" : ` of ${totalRounds}`}`;
  const ovals = !endless && totalRounds <= 12;
  const small = totalRounds > 7;
  return (
    <header className="grid h-20 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 sm:h-24">
      <button type="button" onClick={onQuit} aria-label="Quit" className="-ml-3 grid h-11 w-11 place-items-center justify-self-start rounded-full text-ink transition-colors hover:bg-paper-2">
        <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M2.5 2.5l13 13M15.5 2.5l-13 13" />
        </svg>
      </button>
      <div className="flex flex-col items-center gap-1.5">
      {ovals ? (
        <div role="img" aria-label={name} className={cx("flex justify-center", small ? "gap-x-1.5 sm:gap-x-2.5" : "gap-x-2.5 sm:gap-x-3.5")}>
          {Array.from({ length: totalRounds }, (_, i) => (
            <span
              key={i}
              className={cx(
                "block -rotate-[22deg] rounded-[50%] transition-colors",
                small ? "h-[9px] w-[12px]" : "h-[11px] w-[15px]",
                i < done ? "bg-blue" : i === done && current ? "border-2 border-ink" : "bg-[#c9c5ba]",
              )}
            />
          ))}
        </div>
      ) : (
        <span aria-label={name} className="text-[15px] font-semibold text-ink-2 tabular">
          {roundNo}
          {!endless && <span className="font-normal text-ink-3"> / {totalRounds}</span>}
        </span>
      )}
      {stage != null && (
        <span key={stage} className={cx("animate-pop text-[12px] font-semibold uppercase leading-none tracking-[0.16em]", STAGE_COLOR[stage])}>
          {STAGE_NAMES[stage]}
        </span>
      )}
      </div>
      <span className="hand justify-self-end text-[34px] leading-none sm:text-[40px]">
        <span className="sr-only">Score </span>
        <Rolling value={score} format={(n) => fmtPoints(n)} duration={700} delay={350} bump="animate-bump-big" />
      </span>
    </header>
  );
}

/** Temporary: with ?kbdebug in the URL, show what the page sees of the on-screen keyboard. */
function KeyboardDebug({ typing, keyboard }: { typing: boolean; keyboard: { top: number; height: number } | null }) {
  const [info, setInfo] = useState("");
  useEffect(() => {
    if (!location.search.includes("kbdebug")) return;
    const id = setInterval(() => {
      const vv = window.visualViewport;
      const el = document.activeElement as HTMLElement | null;
      const r = document.querySelector("[role=combobox]")?.getBoundingClientRect();
      const ul = document.querySelector("[role=listbox]")?.getBoundingClientRect();
      const pin = document.querySelector("[data-viewport]")?.getBoundingClientRect();
      setInfo(
        `coarse ${matchMedia("(pointer: coarse)").matches} hover ${matchMedia("(hover: none)").matches} active ${el?.tagName}/${(el as HTMLInputElement)?.type ?? ""}\n` +
          `inner ${innerHeight} vv ${vv ? `${Math.round(vv.height)}@${Math.round(vv.offsetTop)} page ${Math.round(vv.pageTop)}` : "none"} scrollY ${Math.round(scrollY)}\n` +
          `input ${r ? `${Math.round(r.top)}-${Math.round(r.bottom)}` : "-"} list ${ul ? `${Math.round(ul.top)}-${Math.round(ul.bottom)}` : "-"} pin ${pin ? `${Math.round(pin.top)}-${Math.round(pin.bottom)}` : "-"} typing ${typing} kb ${keyboard ? `${keyboard.height}@${keyboard.top}` : "null"}`,
      );
    }, 250);
    return () => clearInterval(id);
  }, [typing, keyboard]);
  if (!info) return null;
  const vvTop = typeof window !== "undefined" && window.visualViewport ? window.visualViewport.offsetTop : 0;
  return (
    <pre style={{ top: vvTop + 110 }} className="pointer-events-none fixed left-1 right-1 z-50 whitespace-pre-wrap bg-ink/85 p-1.5 text-[11px] leading-tight text-paper">
      {info}
    </pre>
  );
}

/** Streams in millions as "843M" or "2.1B". */
function formatPlays(millions: number): string {
  return millions >= 1000 ? `${(millions / 1000).toFixed(millions >= 10000 ? 0 : 1)}B` : `${millions}M`;
}

/** The song in Spotify (the app, on phones that have it), or a Spotify search when we only know its name. */
function spotifyLink(t: Track): string {
  if (t.spotifyId) return `https://open.spotify.com/track/${t.spotifyId}`;
  return `https://open.spotify.com/search/${encodeURIComponent(`${cleanTitle(t.title)} ${t.artists[0] ?? ""}`.trim())}`;
}

/** Easy to Brutal: blue through to red. */
const STAGE_COLOR = ["text-blue", "text-blue", "text-gold", "text-red", "text-red"];

/** Longer than any preview: the player stops at the end of the audio it has. */
const WHOLE_CLIP = 30;

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
  /** Length the clip that's playing will run to, so its end can be reported. */
  const target = useRef(0);
  const finished = useRef<((seconds: number) => void) | null>(null);
  const play = useCallback(
    async (seconds: number, onFinish?: (seconds: number) => void) => {
      player.unlock();
      cancel();
      setPlaying(true);
      setError(null);
      target.current = seconds;
      finished.current = onFinish ?? null;
      try {
        await player.play(seconds, () => {
          setPlaying(false);
          setElapsed(null);
          cancel();
          finished.current?.(target.current);
        });
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        dlog("play error", { err: String(e).slice(0, 100) });
        setPlaying(false);
        setError((e as Error).message);
      }
    },
    [player, tick],
  );
  const stop = useCallback(() => {
    finished.current = null;
    player.stop();
    setPlaying(false);
    setElapsed(null);
    cancel();
  }, [player]);
  /** Run the clip that's playing on to `seconds`; start it if nothing is playing. */
  const extend = useCallback(
    (seconds: number, onFinish?: (seconds: number) => void) => {
      player.unlock();
      if (playing && player.extend?.(seconds)) {
        target.current = seconds;
        finished.current = onFinish ?? null;
        return;
      }
      play(seconds, onFinish);
    },
    [player, playing, play],
  );
  useEffect(() => () => cancel(), []);
  return { playing, elapsed, error, setError, play, stop, extend };
}

export function Game({ source, player, settings, totalRounds, seed, playlistOptions = [], banner, onFinish, onQuit }: Props) {
  const [round, setRound] = useState<RoundState | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [shake, setShake] = useState(0);
  const { playing, elapsed, error: audioError, setError: setAudioError, play: playLen, stop, extend: extendLen } = usePlayback(player);
  const nextRef = useRef<Promise<Track | null> | null>(null);
  const failures = useRef(0);
  const steps = settings.steps;
  const score = results.reduce((a, r) => a + r.points, 0);
  const fieldsAsked = settings.fields.length ? settings.fields : (["title"] as AnswerField[]);
  const multi = !(fieldsAsked.length === 1 && fieldsAsked[0] === "title");
  /** What a correct answer is charged for: the longest clip played (at least the first stop). */
  const listenedOf = (r: RoundState) => Math.max(r.heard, steps[0]);

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
        len: settings.steps[0],
        heard: 0,
        guesses: [],
        status: "guessing",
        points: 0,
        twist,
        fields: fieldsAsked.map((field) => ({ field, status: "open", points: 0, penalty: 0, wrong: [] })),
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

  /** Only what has actually played counts as heard (and costs points). */
  const markHeard = useCallback((seconds: number) => {
    setRound((x) => (x && x.status === "guessing" && seconds > x.heard ? { ...x, heard: seconds } : x));
  }, []);
  useEffect(() => {
    if (playing && elapsed != null) markHeard(elapsed);
  }, [playing, elapsed, markHeard]);

  /** Play the clip up to the playhead. */
  function playClip() {
    const r = round;
    if (!r || r.status !== "guessing") return;
    playLen(r.len, markHeard);
  }
  /** Stopping early moves the playhead back to where you stopped: you only pay for what you heard. */
  function stopClip() {
    const at = player.elapsed();
    stop();
    setRound((x) => {
      if (!x || x.status !== "guessing") return x;
      const heard = Math.max(x.heard, at ?? 0);
      return { ...x, heard, len: Math.min(x.len, Math.max(steps[0], heard)) };
    });
  }
  const toggle = () => (playing ? stopClip() : playClip());

  const upcoming = round ? nextStop(steps, Math.max(round.len, round.heard)) : null;

  /** Move the playhead to the next stop and play it. */
  function hearNext() {
    const r = round;
    if (!r || r.status !== "guessing") return;
    const next = nextStop(steps, Math.max(r.len, r.heard));
    if (next == null) return;
    setRound({ ...r, len: next });
    extendLen(next, markHeard);
  }

  /** Moving the playhead while a clip plays moves where it stops: behind what's played, it stops now. */
  const setLen = (v: number) => {
    setRound((r) => (r && r.status === "guessing" ? { ...r, len: v } : r));
    if (!playing || !round || round.status !== "guessing") return;
    const at = player.elapsed() ?? 0;
    if (v <= at + 0.02) {
      stop();
      setRound((x) => (x && x.status === "guessing" ? { ...x, heard: Math.max(x.heard, at) } : x));
    } else extendLen(v, markHeard);
  };

  /** Apply new field states; if nothing is open any more, the round is over. */
  function settle(r: RoundState, fields: FieldState[], guesses: Guess[], patch: Partial<RoundState> = {}) {
    const next: RoundState = { ...r, ...patch, fields, guesses };
    if (fields.some((f) => f.status === "open")) {
      setRound(next);
      return;
    }
    // The answer is out: play the whole preview, without the twist.
    player.setTwist("none");
    extendLen(WHOLE_CLIP);
    const points = fields.reduce((a, f) => a + netPoints(f.points, f.penalty), 0);
    const won = fields.every((f) => f.status === "right");
    setRound({ ...next, points, status: won || fields.some((f) => f.points > 0) ? "won" : "lost" });
    const listened = listenedOf(next);
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
          points: netPoints(f.points, f.penalty),
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
    const at = listenedOf(r);
    const shown = artist ? `${value} · ${artist}` : value;
    const guesses = [...r.guesses, { text: label(field) + shown, artist, correct: ok, at }];
    let patch: Partial<RoundState> = {};
    let fields = r.fields.map((x) =>
      x.field !== field ? x : ok ? { ...x, status: "right" as const, points: pointsFor(at, settings), guess: value, at } : { ...x, penalty: x.penalty + settings.wrongPenalty, guess: value, wrong: [...x.wrong, shown] },
    );
    if (!ok) {
      setShake((n) => n + 1);
      if (settings.wrongUnlocks) {
        const next = nextStop(steps, Math.max(r.len, r.heard));
        if (next == null) fields = fields.map((x) => (x.field === field ? { ...x, status: "wrong" as const, at } : x));
        else patch = { len: next, heard: Math.max(r.heard, next) };
      }
    }
    settle(r, fields, guesses, patch);
  }

  function submitGraded(field: "year" | "plays" | "myplays" | "added", value: number, shown: string) {
    const r = round;
    if (!r || r.status !== "guessing") return;
    const at = listenedOf(r);
    const g = grade(field, value, r.track);
    const credit = g?.credit ?? 0;
    const pts = Math.round(pointsFor(at, settings) * credit);
    const status = credit >= 0.999 ? ("right" as const) : pts > 0 ? ("close" as const) : ("wrong" as const);
    const guesses = [...r.guesses, { text: `${label(field)}${shown}${g ? ` (${g.detail})` : ""}`, correct: status === "right", at }];
    const fields = r.fields.map((x) => (x.field === field ? { ...x, status, points: pts, guess: shown, detail: g?.detail, at } : x));
    if (status !== "right") setShake((n) => n + 1);
    settle(r, fields, guesses);
  }

  function submitChoice(option: string) {
    const r = round;
    if (!r || r.status !== "guessing") return;
    const at = listenedOf(r);
    const ok = !!r.track.playlists?.includes(option);
    const guesses = [...r.guesses, { text: `${label("playlist")}${option}`, correct: ok, at }];
    const fields = r.fields.map((x) =>
      x.field === "playlist" ? (ok ? { ...x, status: "right" as const, points: pointsFor(at, settings), guess: option, at } : { ...x, status: "wrong" as const, penalty: settings.wrongPenalty, guess: option, at }) : x,
    );
    if (!ok) setShake((n) => n + 1);
    settle(r, fields, guesses);
  }

  function giveUp() {
    const r = round;
    if (!r || r.status !== "guessing") return;
    settle(r, r.fields.map((f) => (f.status === "open" ? { ...f, status: "wrong" as const } : f)), [...r.guesses, { text: "Gave up", skipped: true, correct: false, at: listenedOf(r) }]);
  }

  function nextRound() {
    if (!round) return;
    stop();
    if (round.index + 1 >= totalRounds) return onFinish(results);
    startRound(round.index + 1, results);
  }

  const playFull = () => (playing ? stop() : playLen(WHOLE_CLIP));

  const guessing = !!round && !loading && round.status === "guessing";
  const roundDone = !!round && !loading && round.status !== "guessing";
  const isLast = !!round && round.index + 1 >= totalRounds;
  const playlistOpen = guessing && round!.fields.some((f) => f.field === "playlist" && f.status === "open");
  const focusAnswer = () => document.querySelector<HTMLElement>("[data-answers] input:not([disabled]), [data-answers] select")?.focus();
  const hearLabel = upcoming != null ? `Hear ${formatSeconds(upcoming)}` : null;
  const none = () => {};
  const shortcuts: Shortcut[] = [
    { keys: [" "], display: "Space", label: "Play or stop", run: toggle, enabled: guessing },
    { keys: ["Enter"], mod: true, typing: true, display: `${modKey()} Enter`, label: hearLabel ?? "Hear next", run: hearNext, enabled: guessing && upcoming != null },
    { keys: ["Enter"], shift: true, typing: true, display: "Shift Enter", label: "Hear next", run: hearNext, enabled: guessing, hidden: true },
    { keys: ["s"], display: "S", label: "Hear next", run: hearNext, enabled: guessing, hidden: true },
    { keys: ["g"], display: "G", label: "Give up", run: giveUp, enabled: guessing, hidden: true },
    { keys: [], display: "Enter", label: "Guess", run: none, enabled: guessing },
    { keys: [], display: "← →", label: "Move the playhead", run: none, enabled: guessing },
    { keys: [], display: "Shift ← →", label: "Move it by 0.1s", run: none, enabled: guessing },
    { keys: ["/"], display: "/", label: "Jump to the answer box", run: focusAnswer, enabled: guessing },
    { keys: ["Escape"], typing: true, display: "Esc", label: "Leave the answer box", run: () => (document.activeElement as HTMLElement | null)?.blur(), enabled: guessing },
    { keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], display: "1 – 9", label: "Pick a playlist", run: (k) => playlistOptions[+k - 1] && submitChoice(playlistOptions[+k - 1]), enabled: playlistOpen },
    { keys: ["Enter"], display: "Enter", label: isLast ? "See results" : "Next song", run: nextRound, enabled: roundDone },
    { keys: [" "], display: "Space", label: "Play the clip", run: playFull, enabled: roundDone },
  ];
  const { help, setHelp } = useShortcuts(shortcuts);

  // Put the caret in the answer box when a round starts (not on touch screens, where it would open the keyboard).
  const activeRound = guessing ? round!.index : -1;
  useEffect(() => {
    if (activeRound < 0 || !window.matchMedia?.("(pointer: fine)").matches) return;
    document.querySelector<HTMLElement>("[data-answers] input:not([disabled])")?.focus({ preventScroll: true });
  }, [activeRound]);

  const penalties = round ? round.fields.reduce((a, f) => a + f.penalty, 0) : 0;
  // What it's worth at the playhead, or at what you've heard if that's further (pulling back can't undo it)
  const potential = round ? netPoints(pointsFor(Math.max(round.heard, round.len), settings), multi ? 0 : penalties) : 0;
  const roundNo = Math.min((round?.index ?? 0) + 1, totalRounds);
  // A wrong guess: the points flash red and shake while they roll down.
  const [stung, setStung] = useState(false);
  useEffect(() => {
    if (!shake) return;
    setStung(true);
    const t = setTimeout(() => setStung(false), 520);
    return () => clearTimeout(t);
  }, [shake]);
  // Phones: while the keyboard is up, pin the round to the part of the page still visible above it.
  const [fieldFocused, setFieldFocused] = useState(false);
  const keyboard = useKeyboard(fieldFocused);
  // A field removed while focused (the answer screen replacing the guess box) never reports leaving.
  const roundKey = `${round?.index}:${round?.status}:${loading}`;
  useEffect(() => setFieldFocused(isTextField(document.activeElement)), [roundKey]);
  const typing = keyboard != null && round?.status === "guessing" && !loading;
  const earliestYear = Math.min(2008, ...source.all.map((t) => (t.addedAt ? new Date(t.addedAt).getUTCFullYear() : 9999)));

  return (
    <div
      className={cx("flex flex-col overflow-x-clip px-5 sm:px-14 tabular", typing ? "overflow-hidden pb-2" : "min-h-dvh pb-6")}
      style={typing ? { position: "fixed", left: 0, right: 0, top: keyboard!.top, height: keyboard!.height } : undefined}
      data-viewport={typing ? "" : undefined}
      onFocus={(e) => isTextField(e.target) && setFieldFocused(true)}
      onBlur={(e) => {
        if (!isTextField(e.target)) return;
        // moving between fields, or iOS re-focusing after the layout shifts, isn't leaving
        setTimeout(() => setFieldFocused(isTextField(document.activeElement)), 120);
      }}
    >
      <KeyboardDebug typing={typing} keyboard={keyboard} />
      <GameHeader onQuit={onQuit} roundNo={roundNo} totalRounds={totalRounds} score={score} done={results.length} current={round?.status === "guessing"} playing={playing} stage={loading ? undefined : round?.track.stage} />
      <ShortcutHelp open={help} onClose={() => setHelp(false)} shortcuts={shortcuts} />
      <main className="mx-auto flex min-h-0 w-full max-w-[952px] flex-1 flex-col">
        {!typing && banner}

        {loading || !round ? (
          <Loading error={audioError} />
        ) : round.status === "guessing" ? (
          <div className={cx("flex flex-1 flex-col", typing ? "min-h-0 justify-end" : "justify-center pb-10 pt-4 sm:pb-16")}>
            <section key={round.index} className={cx("animate-pop text-center", typing && "sr-only")}>
              <p className={cx("hand leading-[0.95] transition-[font-size,color] duration-200", stung ? "animate-shake text-red" : "text-blue", typing ? "text-[56px]" : multi ? "text-[96px] sm:text-[128px]" : "text-[104px] sm:text-[150px]")}>
                <span className="sr-only">{multi ? "Each answer is worth " : "Worth "}</span>
                <Rolling value={potential} format={(n) => fmtPoints(n)} duration={300} />
                <span className="sr-only"> points</span>
              </p>
              {round.twist !== "none" && <p className="mt-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-2">{TWIST_INFO[round.twist].label}</p>}
            </section>

            <div className={cx("flex items-start gap-3 sm:gap-5", typing ? "mt-1" : "mt-6 sm:mt-10")}>
              <div className="flex shrink-0 items-center" style={{ height: TIMELINE_HEIGHT }}>
                <PlayButton playing={playing} seconds={round.len} onClick={toggle} />
              </div>
              <Timeline
                className="min-w-0 flex-1"
                steps={steps}
                value={round.len}
                heard={round.heard}
                progress={playing ? elapsed : null}
                onChange={setLen}
                valueText={`${formatSeconds(round.len)}, ${fmtPoints(potential)} points`}
              />
            </div>
            {audioError && <p className="mt-3 text-[15px] text-red">{audioError}</p>}

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
              <div className={typing ? "mt-3" : "mt-8 sm:mt-10"} data-answers>
                <GuessInput pool={source.all} scope={settings.answerScope} onGuess={(g: GuessValue) => submitText("title", g.title, g.artist)} onEmptySpace={toggle} shake={shake} />
              </div>
            )}

            <div className={cx("flex items-center justify-between gap-x-6 gap-y-3", typing ? "mt-3 flex-nowrap" : "mt-4 flex-wrap")}>
              {multi ? <span /> : <WrongList items={round.fields[0].wrong} oneLine={typing} />}
              <div className="ml-auto flex shrink-0 items-center gap-6">
                {hearLabel && (
                  <Button variant="secondary" onClick={hearNext} className="min-h-12 px-6">
                    {hearLabel}
                  </Button>
                )}
                <Button variant="text" onClick={giveUp} className="min-h-12">
                  Give up
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Reveal key={round.index} round={round} multi={multi} onPlay={playFull} playing={playing} onNext={nextRound} isLast={isLast} />
        )}
      </main>
    </div>
  );
}

function PlayButton({ playing, seconds, onClick }: { playing: boolean; seconds: number; onClick: () => void }) {
  return (
    <div className="relative">
      {playing && <span className="pulse-ring pointer-events-none absolute inset-0 rounded-full bg-red" aria-hidden />}
      {playing && <NoteSpray />}
      <button
        type="button"
        onClick={onClick}
        aria-label={playing ? "Stop" : `Play ${formatSeconds(seconds)}`}
        className="relative grid h-[84px] w-[84px] place-items-center rounded-full bg-red text-paper transition-[background-color,transform] hover:bg-[#9e2c2c] active:scale-[0.94] sm:h-[112px] sm:w-[112px]"
      >
        {playing ? (
          <svg viewBox="0 0 32 32" className="h-7 w-7 sm:h-9 sm:w-9" fill="currentColor" aria-hidden>
            <rect x="5" y="5" width="22" height="22" rx="2.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 32 32" className="ml-1.5 h-8 w-8 sm:h-10 sm:w-10" fill="currentColor" aria-hidden>
            <path d="M7 3.8c0-1.5 1.6-2.4 2.9-1.7l18.6 12.2c1.2.8 1.2 2.6 0 3.4L9.9 29.9C8.6 30.6 7 29.7 7 28.2z" />
          </svg>
        )}
      </button>
    </div>
  );
}

/** Notes drifting up and off the play button while a clip plays. */
const SPRAY: [GlyphType, number, number, number, number][] = [
  ["eighth", 22, -74, 16, 0],
  ["quarter", 58, -50, -14, 1],
  ["pair", 6, -96, 10, 2],
  ["eighth", 70, -88, 24, 1],
  ["half", 40, -112, -10, 0],
  ["eighth", 84, -38, 18, 2],
];

function NoteSpray() {
  return (
    <svg viewBox="0 0 24 24" className="pointer-events-none absolute -top-1 right-0 h-6 w-6 overflow-visible" aria-hidden>
      {SPRAY.map(([type, dx, dy, r, c], i) => (
        <Glyph key={i} type={type} x={12} y={14} scale={0.62} fill={NOTE_COLORS[c]} className="note-float" style={{ "--dx": `${dx}px`, "--dy": `${dy}px`, "--r": `${r}deg`, animationDelay: `${i * 0.28}s` } as React.CSSProperties} />
      ))}
    </svg>
  );
}

function Loading({ error }: { error: string | null }) {
  const types: GlyphType[] = ["quarter", "eighth", "half"];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-24" role="status">
      <svg width="112" height="56" viewBox="0 0 112 56" aria-hidden>
        {types.map((t, i) => (
          <Glyph key={t} type={t} x={20 + i * 34} y={42} fill={NOTE_COLORS[i]} className="note-bob" style={{ animationDuration: "1.2s", animationDelay: `${i * 0.18}s` }} />
        ))}
      </svg>
      <span className="text-[17px] text-ink-2">Finding a song</span>
      {error && <span className="text-[15px] text-red">{error}</span>}
    </div>
  );
}

function WrongList({ items, oneLine }: { items: string[]; oneLine?: boolean }) {
  if (!items.length) return <span />;
  // while typing on a phone: one line, newest first, so it never pushes Hear / Give up away
  const shown = oneLine ? [...items].reverse() : items;
  return (
    <ul className={cx("flex min-w-0 items-center gap-x-5 gap-y-1.5", oneLine ? "flex-1 flex-nowrap overflow-hidden" : "w-full flex-wrap sm:w-auto sm:flex-1")} aria-label="Wrong guesses">
      {shown.map((w, i) => (
        <li key={i} className={cx("flex min-w-0 items-center gap-2 text-[16px] text-ink-3", oneLine && "shrink-0 last:shrink")}>
          <CrossGlyph className="text-red" />
          <s className="truncate decoration-ink-3">{w}</s>
        </li>
      ))}
    </ul>
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
  const wide = round.fields.length > 1;
  // one question: no label (the box says what it wants), and the box is full size
  const single = !wide;
  return (
    <div className={cx("mt-8 grid gap-x-6 gap-y-5 sm:mt-10", wide && "sm:grid-cols-2")} data-answers>
      {round.fields.map((f) => {
        const info = FIELD_INFO[f.field];
        return (
          <div key={f.field} className={cx("min-w-0", wide && (f.field === "playlist" || f.field === "added") && "sm:col-span-2")}>
            {!single && <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{info.label}</div>}
            {f.status !== "open" ? (
              <div className="flex h-14 min-w-0 items-center gap-2.5 text-[18px]">
                {f.status === "right" ? <CheckGlyph className="text-blue" /> : f.status === "close" ? <CheckGlyph className="text-gold" /> : <CrossGlyph className="text-red" />}
                <span className={cx("truncate", f.status === "wrong" ? "text-ink-3 line-through" : "font-semibold")}>{f.guess ?? "No answer"}</span>
                {f.detail && <span className="shrink-0 text-[15px] text-ink-2">· {f.detail}</span>}
              </div>
            ) : f.field === "title" ? (
              <GuessInput id="guess-title" compact hideArtist={asksArtist} pool={pool} scope={settings.answerScope} onGuess={(g) => onText("title", g.title, asksArtist ? undefined : g.artist)} onEmptySpace={onEmptySpace} shake={shake} />
            ) : f.field === "artist" ? (
              <ArtistInput pool={pool} scope={settings.answerScope} onGuess={(v) => onText("artist", v)} onEmptySpace={onEmptySpace} shake={shake} />
            ) : f.field === "album" ? (
              <AlbumInput pool={pool} scope={settings.answerScope} onGuess={(v) => onText("album", v)} onEmptySpace={onEmptySpace} shake={shake} />
            ) : f.field === "year" ? (
              <YearInput big={single} onSubmit={(y) => onGraded("year", y, String(y))} onEmptySpace={onEmptySpace} />
            ) : f.field === "plays" ? (
              <CountInput big={single} id="guess-plays" label="Total plays" placeholder={single ? "Total plays, e.g. 2.5m" : "e.g. 2.5m or 300k"} onSubmit={(n) => onGraded("plays", n, formatCount(n))} onEmptySpace={onEmptySpace} />
            ) : f.field === "myplays" ? (
              <CountInput big={single} id="guess-myplays" label="Your plays" placeholder="Your plays" onSubmit={(n) => onGraded("myplays", n, `${n.toLocaleString()} plays`)} onEmptySpace={onEmptySpace} />
            ) : f.field === "added" ? (
              <MonthInput minYear={earliestYear} onSubmit={(m) => onGraded("added", m, formatMonth(new Date(Date.UTC(Math.floor(m / 12), m % 12, 15)).toISOString()))} />
            ) : (
              <ChoiceInput options={playlistOptions} onPick={onChoice} />
            )}
            {f.status === "open" && f.wrong.length > 0 && (
              <div className="mt-2 flex">
                <WrongList items={f.wrong} />
              </div>
            )}
          </div>
        );
      })}
    </div>
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

/** Notes flying up off the album art after a right answer: [type, x, y, rotate, scale, colour]. */
const BURST_TYPES: GlyphType[] = ["eighth", "three", "half", "quarter", "pair", "eighth", "sixteenth"];

/** Notes thrown out of the cover on a right answer. Some land around it and keep swaying. */
function NoteBurst({ seed }: { seed: number }) {
  const rand = rng(seed * 7919 + 13);
  const n = 18;
  const notes = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (rand() - 0.5) * 0.45;
    const dist = 100 + rand() * 46;
    // land the upper ones, and every third one on the sides
    const land = (Math.sin(a) < -0.3 && i % 2 === 0) || (Math.abs(Math.cos(a)) > 0.85 && i % 3 === 0);
    const r = land ? 60 + rand() * 14 : dist;
    return {
      type: BURST_TYPES[i % BURST_TYPES.length],
      x: Math.cos(a) * 36,
      y: Math.sin(a) * 36,
      dx: Math.cos(a) * r,
      dy: Math.sin(a) * r,
      r: (rand() - 0.5) * 70,
      c: i % 3,
      delay: 90 + rand() * 200,
      t: land ? 900 : 950 + rand() * 450,
      land,
      sway: { sx: (rand() - 0.5) * 10, sy: -4 - rand() * 6, st: 2.2 + rand() * 1.6, d: rand() * 1.5 },
    };
  });
  return (
    <svg viewBox="-110 -110 220 220" className="pointer-events-none absolute left-1/2 top-1/2 w-[220%] -translate-x-1/2 -translate-y-1/2 overflow-visible" aria-hidden>
      {notes.map((m, i) => {
        const fly = { "--dx": `${(m.dx - m.x).toFixed(1)}px`, "--dy": `${(m.dy - m.y).toFixed(1)}px`, "--r": `${m.r.toFixed(0)}deg`, "--t": `${m.t.toFixed(0)}ms`, animationDelay: `${m.delay.toFixed(0)}ms` } as React.CSSProperties;
        if (!m.land) return <Glyph key={i} type={m.type} x={m.x} y={m.y} scale={0.42} fill={NOTE_COLORS[m.c]} className="note-burst" style={fly} />;
        const sway = { "--sx": `${m.sway.sx.toFixed(1)}px`, "--sy": `${m.sway.sy.toFixed(1)}px`, "--st": `${m.sway.st.toFixed(2)}s`, animationDelay: `${(m.t + m.delay) / 1000 + m.sway.d}s` } as React.CSSProperties;
        return (
          <g key={i} className="note-land" style={fly}>
            <Glyph type={m.type} x={m.x} y={m.y} scale={0.42} fill={NOTE_COLORS[m.c]} className="note-sway" style={sway} />
          </g>
        );
      })}
    </svg>
  );
}

/** While the song plays on the answer screen, notes keep drifting up off the cover. */
function CoverStream({ seed }: { seed: number }) {
  const rand = rng(seed * 104729 + 7);
  const notes = Array.from({ length: 7 }, (_, i) => ({
    type: BURST_TYPES[(i * 3) % BURST_TYPES.length],
    x: -38 + rand() * 76,
    dx: (rand() - 0.5) * 70,
    dy: -55 - rand() * 40,
    r: (rand() - 0.5) * 50,
    c: (i + 1) % 3,
    dur: 2.2 + rand() * 1.1,
    delay: i * 0.42,
  }));
  return (
    <svg viewBox="-110 -110 220 220" className="pointer-events-none absolute left-1/2 top-1/2 w-[220%] -translate-x-1/2 -translate-y-1/2 overflow-visible" aria-hidden>
      {notes.map((m, i) => (
        <Glyph
          key={i}
          type={m.type}
          x={m.x}
          y={-46}
          scale={0.36}
          fill={NOTE_COLORS[m.c]}
          className="note-float"
          style={{ "--dx": `${m.dx.toFixed(1)}px`, "--dy": `${m.dy.toFixed(1)}px`, "--r": `${m.r.toFixed(0)}deg`, animationDuration: `${m.dur.toFixed(2)}s`, animationDelay: `${m.delay}s` } as React.CSSProperties}
        />
      ))}
    </svg>
  );
}

function Reveal({ round, multi, onPlay, playing, onNext, isLast }: { round: RoundState; multi: boolean; onPlay: () => void; playing: boolean; onNext: () => void; isLast: boolean }) {
  const t = round.track;
  const pts = round.points;
  const won = pts > 0;
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus({ preventScroll: true }), []);
  const title = cleanTitle(t.title);
  const year = t.year ?? (t.decade ? `${t.decade}s` : null);
  const meta = [t.artists.join(", "), year].filter(Boolean).join(" · ");
  const plays = t.streams ? `${formatPlays(t.streams)} plays on Spotify` : null;
  return (
    <div className="flex flex-1 flex-col justify-center pb-6 pt-4 sm:pb-24 sm:pt-28">
      <div className="grid items-center justify-items-center gap-5 text-center sm:grid-cols-[minmax(0,340px)_minmax(0,1fr)] sm:justify-items-stretch sm:gap-[72px] sm:text-left">
        <div className="relative w-[min(200px,52vw,24dvh)] sm:w-full">
          <a href={spotifyLink(t)} target="_blank" rel="noreferrer" aria-label={`Open ${title} in Spotify`} className={cx("block rounded-[6px]", won ? "cover-pop" : "cover-drop")}>
            {t.image ? <img src={t.image} alt="" className="aspect-square w-full rounded-[6px] object-cover shadow-[0_18px_40px_-20px_rgb(30_30_30/0.5)]" /> : <div className="aspect-square w-full rounded-[6px] bg-paper-2" />}
          </a>
          {won && <span className="ring-out pointer-events-none absolute inset-0 rounded-[10px] border-[3px] border-blue" style={{ animationDelay: "160ms" }} aria-hidden />}
          {won && <NoteBurst seed={round.index + 1} />}
          {playing && <CoverStream seed={round.index + 1} />}
        </div>
        <div className="min-w-0" aria-live="polite">
          <p className={cx("hand text-[64px] leading-[0.95] sm:text-[128px]", pts === 0 ? "text-ink-3" : "text-blue")}>
            <Rolling value={pts} from={0} delay={220} duration={750} format={(n) => fmtPoints(n, true)} />
            <span className="sr-only"> points</span>
          </p>
          <h2 style={{ animationDelay: "120ms" }} className={cx("rise-in hand mt-2 break-words leading-[1.05]", title.length > 48 ? "text-[24px] sm:text-[40px]" : title.length > 28 ? "text-[28px] sm:text-[46px]" : "text-[34px] sm:text-[60px]")}>{title}</h2>
          {meta && (
            <p style={{ animationDelay: "200ms" }} className="rise-in mt-2 text-[17px] text-ink-2 sm:mt-3 sm:text-[22px]">
              {meta}
            </p>
          )}
          {plays && (
            <p style={{ animationDelay: "240ms" }} className="rise-in mt-0.5 text-[15px] text-ink-3 sm:text-[17px]">
              {plays}
            </p>
          )}
          {round.twist !== "none" && <p className="mt-1 text-[15px] text-ink-3">{TWIST_INFO[round.twist].label}</p>}
          {multi && <FieldList round={round} />}
          <div style={{ animationDelay: "280ms" }} className="rise-in mt-6 flex flex-wrap items-center justify-center gap-3 sm:mt-8 sm:justify-start">
            <Button
              ref={nextRef}
              variant="primary"
              onClick={onNext}
              onKeyDown={(e) => {
                // Space plays the clip on this screen, even with Next focused; ignore held-down Enter.
                if (e.key === " ") {
                  e.preventDefault();
                  if (!e.repeat) onPlay();
                } else if (e.key === "Enter" && e.repeat) e.preventDefault();
              }}
              onKeyUp={(e) => e.key === " " && e.preventDefault()}
            >
              {isLast ? "See results" : "Next song"}
            </Button>
            <Button variant="secondary" onClick={onPlay}>
              {playing ? <StopGlyph /> : <PlayGlyph />}
              {playing ? "Stop" : "Play the clip"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldList({ round }: { round: RoundState }) {
  // one question: a single line under the song; its points are already the big number
  if (round.fields.length === 1) {
    const f = round.fields[0];
    const exact = f.status === "right";
    const text = exact ? (f.detail && f.detail !== "exact" ? `Spot on · ${f.detail}` : "Spot on") : f.guess ? `You said ${f.guess}${f.detail && f.detail !== "exact" ? ` · ${f.detail}` : ""}` : "No answer";
    return (
      <p style={{ animationDelay: "280ms" }} className={cx("rise-in mt-3 inline-flex items-center gap-2 text-[17px] sm:text-[19px]", exact ? "text-blue" : f.status === "close" ? "text-ink-2" : "text-red")}>
        {exact ? <CheckGlyph className="text-blue" /> : f.status === "close" ? <CheckGlyph className="text-gold" /> : <CrossGlyph className="text-red" />}
        {text}
      </p>
    );
  }
  return (
    <dl style={{ animationDelay: "280ms" }} className="rise-in mx-auto mt-5 w-full max-w-[440px] border-t border-rule text-left sm:mx-0">
      {round.fields.map((f) => {
        const net = netPoints(f.points, f.penalty);
        return (
          <div key={f.field} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-rule py-2.5">
            <dt className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{FIELD_INFO[f.field].label}</span>
              <span className="block truncate text-[17px] text-ink">{answerText(f.field, round.track)}</span>
              {f.status !== "right" && (
                <span className="block truncate text-[14px] text-ink-2">
                  {f.guess ? `You said ${f.guess}` : "No answer"}
                  {f.detail && f.detail !== "exact" ? ` · ${f.detail}` : ""}
                </span>
              )}
            </dt>
            <dd className={cx("hand text-[26px] leading-none", net === 0 ? "text-ink-3" : "text-blue")}>{fmtPoints(net, true)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
