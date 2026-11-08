import type { StartMode } from "./types";

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

  private context(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    return this.ctx;
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

  /** Play `length` seconds from `offset`. Returns the AudioContext time playback began. */
  async play(offset: number, length: number, onEnded: () => void): Promise<number> {
    const ctx = this.context();
    if (ctx.state !== "running") await ctx.resume();
    this.stop();
    if (!this.buffer || !this.gain) throw new Error("nothing loaded");
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    const env = ctx.createGain();
    src.connect(env).connect(this.gain);
    const t0 = ctx.currentTime + 0.02;
    const len = Math.max(0.01, Math.min(length, this.buffer.duration - offset));
    const fade = Math.min(0.004, len / 4);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(1, t0 + fade);
    env.gain.setValueAtTime(1, t0 + len - fade);
    env.gain.linearRampToValueAtTime(0, t0 + len);
    this.gain.gain.setValueAtTime(this.volume, ctx.currentTime);
    src.onended = () => {
      if (this.source === src) this.source = null;
      onEnded();
    };
    src.start(t0, offset, len);
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
