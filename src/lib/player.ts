import type { GameSettings, Track } from "./types";
import { PreviewEngine } from "./audio";
import { previewCandidates } from "./resolve";
import { SpotifyFullTrackPlayer } from "./spotify/player";
import { searchTrackId } from "./spotify/api";

export interface SnippetPlayer {
  /** Prepare audio for a track (may run ahead of time for the next round). False = no audio found. */
  prepare(track: Track): Promise<boolean>;
  /** Make a prepared track current and choose where snippets start. */
  activate(track: Track, rand: () => number): Promise<void>;
  /** Play the first `seconds` of the snippet. */
  play(seconds: number, onEnded: () => void): Promise<void>;
  /** Seconds of the current snippet heard so far, or null if nothing is playing. */
  elapsed(): number | null;
  stop(): void;
  setVolume(v: number): void;
  /** Where the snippet starts within the audio, for display. */
  startLabel(): string;
  dispose(): void;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export class PreviewSnippetPlayer implements SnippetPlayer {
  private engine = new PreviewEngine();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private offset = 0;
  private startedAt: number | null = null;
  private length = 0;

  constructor(private settings: GameSettings) {
    this.engine.setVolume(settings.volume);
  }

  prepare(track: Track): Promise<boolean> {
    let p = this.buffers.get(track.key);
    if (!p) {
      p = (async () => {
        for await (const url of previewCandidates(track)) {
          try {
            return await this.engine.decode(url);
          } catch {
            /* try next source */
          }
        }
        return null;
      })();
      this.buffers.set(track.key, p);
    }
    return p.then((b) => !!b);
  }

  async activate(track: Track, rand: () => number) {
    const buf = await this.buffers.get(track.key);
    if (!buf) throw new Error("audio not prepared");
    this.engine.setBuffer(buf);
    const longest = this.settings.steps[this.settings.steps.length - 1] ?? 16;
    this.offset = this.engine.pickStart(this.settings.startMode, longest, rand);
    // free memory from older rounds
    for (const key of this.buffers.keys()) if (key !== track.key && this.buffers.size > 3) this.buffers.delete(key);
  }

  async play(seconds: number, onEnded: () => void) {
    this.length = seconds;
    const t0 = await this.engine.play(this.offset, seconds, () => {
      this.startedAt = null;
      onEnded();
    });
    this.startedAt = t0;
  }

  elapsed() {
    if (this.startedAt == null) return null;
    return Math.max(0, Math.min(this.length, this.engine.now() - this.startedAt));
  }

  stop() {
    this.engine.stop();
    this.startedAt = null;
  }

  setVolume(v: number) {
    this.engine.setVolume(v);
  }

  startLabel() {
    return `${fmt(this.offset)} into a 30s preview`;
  }

  dispose() {
    this.stop();
    this.buffers.clear();
  }
}

export class SpotifySnippetPlayer implements SnippetPlayer {
  private sp = new SpotifyFullTrackPlayer();
  private ids = new Map<string, Promise<string | null>>();
  private offsetMs = 0;
  private startedAt: number | null = null;
  private length = 0;

  constructor(private settings: GameSettings) {
    this.sp.setVolume(settings.volume);
  }

  prepare(track: Track): Promise<boolean> {
    let p = this.ids.get(track.key);
    if (!p) {
      p = track.spotifyId ? Promise.resolve(track.spotifyId) : searchTrackId(track.title, track.artists[0] ?? "").catch(() => null);
      this.ids.set(track.key, p);
    }
    return p.then((id) => !!id);
  }

  async activate(track: Track, rand: () => number) {
    const id = await this.ids.get(track.key);
    if (!id) throw new Error("song not on Spotify");
    const dur = track.durationMs ?? 180_000;
    const longest = (this.settings.steps[this.settings.steps.length - 1] ?? 16) * 1000;
    const mode = this.settings.startMode;
    this.offsetMs = mode === "beginning" ? 0 : mode === "middle" ? Math.max(0, dur / 2 - longest / 2) : Math.max(0, (dur - longest - 5000) * (0.1 + 0.8 * rand()));
    await this.sp.load(id, this.offsetMs);
  }

  async play(seconds: number, onEnded: () => void) {
    this.length = seconds;
    this.startedAt = null;
    await this.sp.play(
      this.offsetMs,
      seconds * 1000,
      () => (this.startedAt = performance.now()),
      () => {
        this.startedAt = null;
        onEnded();
      },
    );
  }

  elapsed() {
    if (this.startedAt == null) return null;
    return Math.max(0, Math.min(this.length, (performance.now() - this.startedAt) / 1000));
  }

  stop() {
    this.sp.stop();
    this.startedAt = null;
  }

  setVolume(v: number) {
    this.sp.setVolume(v);
  }

  startLabel() {
    return this.offsetMs === 0 ? "the very start of the song" : `${fmt(this.offsetMs / 1000)} into the song`;
  }

  dispose() {
    this.sp.disconnect();
  }
}
