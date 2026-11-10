import type { StartMode, Twist } from "./types";
import { dlog } from "./dlog";

export type ActiveTwist = Exclude<Twist, "random">;

// 50ms of silence. Playing it from an <audio> element during a tap moves iOS into the "playback"
// audio category, so Web Audio is heard even with the ring/silent switch on (older iOS).
const SILENT_WAV = "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

let htmlUnlocked = false;

const RATE: Record<ActiveTwist, number> = { none: 1, reverse: 1, fast: 1.5, slow: 0.7, muffled: 1 };

/** iOS: this is media playback (heard with the silent switch on), set before any context exists. */
function playbackSession() {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== "playback") session.type = "playback";
  } catch {
    /* not supported */
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

type Hit = { time: number; strength: number };
const hitCache = new WeakMap<AudioBuffer, Hit[]>();

/**
 * The clear hits in a clip (a kick, a snare, a chord landing): peaks in how fast the energy rises,
 * weighted to the low end, at least 50ms apart. Clips that start on one sound like the music
 * starting, not like being dropped into the middle of a note.
 */
export function hits(buf: AudioBuffer): Hit[] {
  const cached = hitCache.get(buf);
  if (cached) return cached;
  const rate = buf.sampleRate;
  const hop = Math.round(rate * 0.005);
  const data = buf.getChannelData(0);
  const n = Math.floor(data.length / hop);
  const env = new Float32Array(n);
  const low = new Float32Array(n);
  const a = Math.exp((-2 * Math.PI * 150) / rate);
  let lp = 0;
  for (let f = 0; f < n; f++) {
    let e = 0;
    let el = 0;
    for (let i = f * hop, end = i + hop; i < end; i++) {
      const x = data[i];
      lp = a * lp + (1 - a) * x;
      e += x * x;
      el += lp * lp;
    }
    env[f] = Math.log1p((e / hop) * 1e4);
    low[f] = Math.log1p((el / hop) * 4e4);
  }
  const rise = new Float32Array(n);
  for (let f = 2; f < n; f++) rise[f] = Math.max(0, env[f] - env[f - 2]) + 1.5 * Math.max(0, low[f] - low[f - 2]);
  const onset = new Float32Array(n);
  for (let f = 1; f < n - 1; f++) onset[f] = 0.25 * rise[f - 1] + 0.5 * rise[f] + 0.25 * rise[f + 1];
  const out: Hit[] = [];
  for (let f = 10; f < n - 10; f++) {
    if (onset[f] <= 0) continue;
    let peak = true;
    for (let g = f - 10; g <= f + 10 && peak; g++) if (onset[g] > onset[f] || (onset[g] === onset[f] && g < f)) peak = false;
    // start a hair before the hit so its attack is in the clip
    if (peak) out.push({ time: Math.max(0, f * 0.005 - 0.006), strength: onset[f] });
  }
  hitCache.set(buf, out);
  return out;
}

/**
 * Sample-accurate snippet playback for 30-second previews using the Web Audio API.
 * A 0.1s snippet is exactly 0.1s of audio (plus a 4ms fade to avoid clicks).
 */
export class PreviewEngine {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  /** Called when the current snippet ends, so a forced stop can report it too. */
  private ended: (() => void) | null = null;
  /** The playing snippet, so it can be lengthened while it plays. */
  private live: { src: AudioBufferSourceNode; env: GainNode; t0: number; offset: number; twist: ActiveTwist } | null = null;
  /** The page was hidden since the last tap: iOS may have left the context interrupted. */
  private stale = false;
  /** The context said "running" but its clock didn't move: it plays nothing (seen on iOS). */
  private frozen = false;
  private watching = false;
  buffer: AudioBuffer | null = null;
  private volume = 0.8;
  private reversed = new WeakMap<AudioBuffer, AudioBuffer>();
  /** Playback speed of the current snippet, so progress can be reported in song time. */
  rate = 1;

  private reverse(buf: AudioBuffer): AudioBuffer {
    let r = this.reversed.get(buf);
    if (!r) {
      r = this.context().createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const src = buf.getChannelData(c);
        const dst = r.getChannelData(c);
        for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
      }
      this.reversed.set(buf, r);
    }
    return r;
  }

  private context(): AudioContext {
    if (!this.ctx) {
      playbackSession();
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.gain = ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(ctx.destination);
      // An interruption (call, another app, the page going away) never fires `ended`: stop and report it.
      ctx.onstatechange = () => {
        dlog("ctx state", { state: ctx.state });
        if (ctx.state !== "running") this.halt();
      };
      dlog("ctx created", { state: ctx.state, rate: ctx.sampleRate });
      if (!this.watching) {
        this.watching = true;
        const away = () => {
          this.halt();
          this.stale = true;
        };
        document.addEventListener("visibilitychange", () => document.hidden && away());
        window.addEventListener("pagehide", away);
        window.addEventListener("pageshow", (e) => e.persisted && away());
      }
    }
    return this.ctx;
  }

  /** Stop the current snippet and tell the caller it ended. */
  private halt() {
    if (!this.source) return;
    dlog("halt", { state: this.ctx?.state });
    const done = this.ended;
    this.stop();
    done?.();
  }

  /** Throw away a context iOS won't resume (left "interrupted" after the page was hidden). */
  private rebuild() {
    this.stop();
    const old = this.ctx;
    this.ctx = null;
    this.gain = null;
    htmlUnlocked = false;
    if (old) {
      old.onstatechange = null;
      old.close().catch(() => {});
    }
  }

  /**
   * Must run synchronously inside a tap/click/keypress. Safari only lets audio start from a user
   * gesture, and iOS mutes Web Audio in silent mode unless the session is set to "playback".
   */
  unlock() {
    playbackSession();
    // Back from another app, or a clock that stopped moving: iOS can leave a context "running" but
    // silent, so start over.
    const state = this.ctx?.state as string | undefined;
    if (this.ctx && (this.stale || this.frozen || state === "interrupted" || state === "closed")) {
      dlog("rebuild", { state, stale: this.stale, frozen: this.frozen });
      this.rebuild();
    }
    this.stale = false;
    this.frozen = false;
    const ctx = this.context();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    if (!htmlUnlocked && isIOS()) {
      htmlUnlocked = true;
      try {
        const el = new Audio(SILENT_WAV);
        el.setAttribute("playsinline", "");
        el.play().catch(() => {
          htmlUnlocked = false;
        });
      } catch {
        htmlUnlocked = false;
      }
    }
    try {
      // a one-sample buffer, started in the gesture, fully wakes WebKit's audio output
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  }

  /** Download + decode a preview into memory. Separate from play() so playback starts instantly. */
  async decode(url: string, signal?: AbortSignal): Promise<AudioBuffer> {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`audio ${res.status}`);
    const data = await res.arrayBuffer();
    // Decoded on the playback context: iOS plays nothing from buffers decoded on an offline one.
    let buf: AudioBuffer;
    try {
      buf = await withTimeout(this.context().decodeAudioData(data), 20000, "audio took too long to decode");
    } catch (e) {
      dlog("decode failed", { host: new URL(url).host, bytes: data.byteLength, err: String(e) });
      throw e;
    }
    if (buf.duration < 3) throw new Error("audio too short");
    return buf;
  }

  setBuffer(buf: AudioBuffer) {
    this.stop();
    this.buffer = buf;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.gain && this.ctx) this.gain.gain.setValueAtTime(v, this.ctx.currentTime);
  }

  get duration() {
    return this.buffer?.duration ?? 0;
  }

  /** First moment the audio is clearly audible (skips silence and fade-ins at the start of previews). */
  audibleStart(): number {
    const buf = this.buffer;
    if (!buf) return 0;
    const data = buf.getChannelData(0);
    const frame = Math.floor(buf.sampleRate * 0.01);
    const rms: number[] = [];
    for (let i = 0; i + frame <= data.length; i += frame) {
      let sum = 0;
      for (let j = i; j < i + frame; j++) sum += data[j] * data[j];
      rms.push(Math.sqrt(sum / frame));
    }
    const sorted = rms.slice().sort((a, b) => a - b);
    const loud = sorted[Math.floor(sorted.length * 0.8)] ?? 0;
    const threshold = Math.max(0.01, loud * 0.35);
    const idx = rms.findIndex((r) => r >= threshold);
    return idx < 0 ? 0 : idx * 0.01;
  }

  /**
   * Where snippets start, given the mode and the longest snippet that must fit. Starts land on a
   * clear hit in the music (one of the strongest, for random starts) rather than anywhere.
   */
  pickStart(mode: StartMode, longest: number, rand: () => number): number {
    const start = this.audibleStart();
    const end = Math.max(start, this.duration - 0.3);
    const latest = Math.max(start, end - longest);
    const all = this.buffer ? hits(this.buffer).filter((h) => h.time >= start - 0.02 && h.time <= latest) : [];
    if (!all.length) {
      if (mode === "beginning") return start;
      if (mode === "middle") return Math.min(latest, Math.max(start, (this.duration - longest) / 2));
      return start + (latest - start) * rand();
    }
    const sorted = all.map((h) => h.strength).sort((x, y) => x - y);
    const strong = all.filter((h) => h.strength >= (sorted[Math.floor(sorted.length * 0.7)] ?? 0));
    // the first clear hit, unless the song takes a while to get going
    if (mode === "beginning") {
      const first = strong[0];
      return first && first.time - start <= 1.5 ? first.time : start;
    }
    if (mode === "middle") {
      const mid = (this.duration - longest) / 2;
      return strong.reduce((x, y) => (Math.abs(y.time - mid) < Math.abs(x.time - mid) ? y : x)).time;
    }
    return strong[Math.floor(rand() * strong.length)].time;
  }

  /**
   * Play `length` seconds of the song from `offset`, with an optional twist. Returns the
   * AudioContext time playback began. Lengths are in song time: a sped-up 1s snippet still
   * contains exactly 1s of the song.
   */
  async play(offset: number, length: number, onEnded: () => void, twist: ActiveTwist = "none"): Promise<number> {
    const ctx = this.context();
    // resume() can hang on iOS after an interruption; don't let that freeze the game
    const before = ctx.state as string;
    if (ctx.state !== "running") await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 600))]);
    dlog("play", { before, after: ctx.state, offset: +offset.toFixed(2), length: +length.toFixed(2), dur: this.buffer ? +this.buffer.duration.toFixed(1) : null, bufRate: this.buffer?.sampleRate, ctxRate: ctx.sampleRate });
    this.stop();
    if (!this.buffer || !this.gain) throw new Error("nothing loaded");
    const len = Math.max(0.01, Math.min(length, this.buffer.duration - offset));
    const rate = RATE[twist];
    this.rate = rate;
    const src = ctx.createBufferSource();
    let start = offset;
    if (twist === "reverse") {
      src.buffer = this.reverse(this.buffer);
      start = Math.max(0, this.buffer.duration - offset - len);
    } else {
      src.buffer = this.buffer;
    }
    src.playbackRate.value = rate;
    const env = ctx.createGain();
    if (twist === "muffled") {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 450;
      lp.Q.value = 0.8;
      src.connect(lp).connect(env);
    } else {
      src.connect(env);
    }
    env.connect(this.gain);
    const t0 = ctx.currentTime + 0.02;
    const real = len / rate;
    const fade = Math.min(0.004, real / 4);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(1, t0 + fade);
    env.gain.setValueAtTime(1, t0 + real - fade);
    env.gain.linearRampToValueAtTime(0, t0 + real);
    this.gain.gain.setValueAtTime(this.volume, ctx.currentTime);
    src.onended = () => {
      if (this.source === src) {
        this.source = null;
        this.ended = null;
      }
      onEnded();
    };
    this.ended = onEnded;
    src.start(t0, start);
    src.stop(t0 + real);
    this.source = src;
    this.live = { src, env, t0, offset, twist };
    // If the clock doesn't move, nothing is playing: stop (so the button resets) and rebuild on the next tap.
    const clock = ctx.currentTime;
    setTimeout(() => {
      if (this.source !== src || this.ctx !== ctx || ctx.currentTime !== clock) return;
      dlog("frozen", { state: ctx.state, clock });
      this.frozen = true;
      this.halt();
    }, 450);
    return t0;
  }

  /**
   * Make the snippet that's playing run to `length` seconds of song time instead of starting over.
   * False if nothing is playing or it can't be stretched (reversed audio, a different twist).
   */
  extend(length: number, twist: ActiveTwist): boolean {
    const live = this.live;
    const ctx = this.ctx;
    if (!live || !ctx || !this.buffer || this.source !== live.src || live.twist !== twist || twist === "reverse") return false;
    const len = Math.max(0.01, Math.min(length, this.buffer.duration - live.offset));
    const end = live.t0 + len / RATE[twist];
    const now = ctx.currentTime;
    if (end <= now + 0.05) return false;
    const g = live.env.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(1, now);
    g.setValueAtTime(1, end - 0.004);
    g.linearRampToValueAtTime(0, end);
    live.src.stop(end);
    return true;
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Done with this engine: close its context (iOS only allows a few open per page). */
  dispose() {
    this.stop();
    this.buffer = null;
    const old = this.ctx;
    this.ctx = null;
    this.gain = null;
    if (old) {
      old.onstatechange = null;
      old.close().catch(() => {});
    }
  }

  stop() {
    this.ended = null;
    this.live = null;
    if (this.source) {
      const s = this.source;
      this.source = null;
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
  }
}
