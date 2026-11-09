import { getAccessToken } from "./auth";
import { sp } from "./api";

// Full-track playback through the Spotify Web Playback SDK (Spotify Premium, desktop browsers).
// Unlike previews this can start at the very beginning of a song. Timing is driven by the SDK's
// state events, so very short snippets are approximate (roughly +/- 0.1s).

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    s.async = true;
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("Could not load the Spotify player"));
    };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

function waitFor<T>(register: (done: (v: T) => void) => () => void, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let cleanup = () => {};
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${what}`));
    }, ms);
    cleanup = register((v) => {
      clearTimeout(timer);
      cleanup();
      resolve(v);
    });
  });
}

export class SpotifyFullTrackPlayer {
  private player: Spotify.Player | null = null;
  private deviceId: string | null = null;
  private volume = 0.8;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: Spotify.PlaybackState | null) => void>();
  durationMs = 0;
  private uri: string | null = null;

  async connect(): Promise<void> {
    if (this.deviceId) return;
    await loadSdk();
    const player = new window.Spotify.Player({
      name: "Earshot",
      volume: this.volume,
      getOAuthToken: (cb) => {
        getAccessToken().then((t) => t && cb(t));
      },
    });
    this.player = player;
    player.addListener("player_state_changed", (s) => this.listeners.forEach((l) => l(s)));
    const errors: string[] = [];
    for (const ev of ["initialization_error", "authentication_error", "account_error", "playback_error"] as const) {
      player.addListener(ev, ({ message }) => errors.push(`${ev}: ${message}`));
    }
    const ready = waitFor<string>((done) => {
      const cb = ({ device_id }: Spotify.WebPlaybackInstance) => done(device_id);
      player.addListener("ready", cb);
      return () => player.removeListener("ready", cb);
    }, 15000, "the Spotify player");
    const ok = await player.connect();
    if (!ok) throw new Error("Spotify player failed to connect");
    try {
      this.deviceId = await ready;
    } catch (e) {
      if (errors.some((x) => x.startsWith("account_error"))) throw new Error("Full-track playback needs Spotify Premium");
      throw e;
    }
  }

  private onState(cb: (s: Spotify.PlaybackState | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Cue a track silently at `positionMs`, paused and ready to play. */
  async load(spotifyId: string, positionMs: number): Promise<void> {
    await this.connect();
    const player = this.player!;
    this.uri = `spotify:track:${spotifyId}`;
    await player.setVolume(0);
    const playing = waitFor<Spotify.PlaybackState>((done) => this.onState((s) => {
      if (s && !s.paused && (s.track_window.current_track?.id === spotifyId || s.track_window.current_track?.uri === this.uri || s.track_window.current_track?.linked_from?.id === spotifyId)) done(s);
    }), 10000, "the song to load");
    await sp(`/me/player/play?device_id=${this.deviceId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uris: [this.uri], position_ms: Math.max(0, Math.round(positionMs)) }),
    });
    const state = await playing;
    await player.pause();
    this.durationMs = state.duration;
    await player.seek(Math.max(0, Math.round(positionMs)));
    await player.setVolume(this.volume);
  }

  /** Play `lengthMs` from `positionMs`. `onStart` fires when audio actually starts, `onEnd` when paused again. */
  async play(positionMs: number, lengthMs: number, onStart: () => void, onEnd: () => void): Promise<void> {
    const player = this.player;
    if (!player) throw new Error("Spotify player not ready");
    this.stop();
    await player.seek(Math.max(0, Math.round(positionMs)));
    let started = false;
    const off = this.onState((s) => {
      if (!started && s && !s.paused) {
        started = true;
        off();
        onStart();
        this.stopTimer = setTimeout(async () => {
          this.stopTimer = null;
          await player.pause();
          onEnd();
        }, lengthMs);
      }
    });
    await player.resume();
    // Some SDK versions don't emit a state change on resume: check the real state before
    // assuming playback started, so a silent failure doesn't look like it's playing.
    setTimeout(async () => {
      if (started) return;
      const state = await player.getCurrentState().catch(() => null);
      if (started) return;
      started = true;
      off();
      if (!state || state.paused) {
        onEnd();
        return;
      }
      onStart();
      this.stopTimer = setTimeout(async () => {
        this.stopTimer = null;
        await player.pause();
        onEnd();
      }, lengthMs);
    }, 1200);
  }

  /** Safari and mobile browsers need this called from a user gesture before audio can play. */
  activate() {
    this.player?.activateElement().catch(() => {});
  }

  stop() {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.player?.pause().catch(() => {});
  }

  setVolume(v: number) {
    this.volume = v;
    this.player?.setVolume(v).catch(() => {});
  }

  disconnect() {
    this.stop();
    this.player?.disconnect();
    this.player = null;
    this.deviceId = null;
  }
}
