import type { StartMode, Twist } from "./types";

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

/**
 * Sample-accurate snippet playback for 30-second previews using the Web Audio API.
 * A 0.1s snippet is exactly 0.1s of audio (plus a 4ms fade to avoid clicks).
 */
export class PreviewEngine {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
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
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /**
   * Must run synchronously inside a tap/click/keypress. Safari only lets audio start from a user
   * gesture, and iOS mutes Web Audio in silent mode unless the session is set to "playback".
   */
  unlock() {
    const ctx = this.context();
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = "playback";
    } catch {
      /* not supported */
    }
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
    const buf = await this.context().decodeAudioData(data);
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

  /** Where snippets start, given the mode and the longest snippet that must fit. */
  pickStart(mode: StartMode, longest: number, rand: () => number): number {
    const start = this.audibleStart();
    const end = Math.max(start, this.duration - 0.3);
    const latest = Math.max(start, end - longest);
    if (mode === "beginning") return start;
    if (mode === "middle") return Math.min(latest, Math.max(start, (this.duration - longest) / 2));
    return start + (latest - start) * rand();
  }

  /**
   * Play `length` seconds of the song from `offset`, with an optional twist. Returns the
   * AudioContext time playback began. Lengths are in song time: a sped-up 1s snippet still
   * contains exactly 1s of the song.
   */
  async play(offset: number, length: number, onEnded: () => void, twist: ActiveTwist = "none"): Promise<number> {
    const ctx = this.context();
    if (ctx.state !== "running") await ctx.resume();
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
      if (this.source === src) this.source = null;
      onEnded();
    };
    src.start(t0, start);
    src.stop(t0 + real);
    this.source = src;
    return t0;
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  stop() {
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
