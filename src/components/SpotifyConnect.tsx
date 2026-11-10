"use client";

import { useEffect, useId, useState } from "react";
import { beginLogin, getClientId, getCustomClientId, isConnected, logout, setCustomClientId } from "@/lib/spotify/auth";
import { getMe } from "@/lib/spotify/api";
import { Button, TextField } from "./ui";

export function useSpotifyUser(enabled = true) {
  const [state, setState] = useState<{ connected: boolean; name?: string; product?: string; error?: string; ready: boolean }>({ connected: false, ready: false });
  useEffect(() => {
    if (!enabled) return;
    if (!isConnected()) return setState({ connected: false, ready: true });
    let live = true;
    getMe()
      .then((me) => live && setState({ connected: true, name: me.display_name || me.id, product: me.product, ready: true }))
      .catch((e: Error & { status?: number }) => {
        if (e.status === 401) logout();
        if (!live) return;
        setState({
          connected: e.status !== 401,
          ready: true,
          error: e.status === 403 ? "Spotify blocked this account. While the app is in development mode, its owner has to add your Spotify email to the app's user list." : e.message,
        });
      });
    return () => {
      live = false;
    };
  }, [enabled]);
  return state;
}

export function SpotifyLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.5 17.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.4-2.1-10.6-1.2a.75.75 0 1 1-.3-1.5c4.6-1 8.6-.6 11.7 1.4.4.2.5.7.2 1Zm1.5-3.3a.94.94 0 0 1-1.3.3c-3.2-2-8.2-2.6-12-1.4a.94.94 0 1 1-.6-1.8c4.4-1.3 9.8-.7 13.5 1.6.5.3.6.9.4 1.3Zm.1-3.4C15.3 8.3 8.9 8.1 5.2 9.2a1.1 1.1 0 1 1-.7-2.2c4.3-1.3 11.3-1 15.7 1.6a1.1 1.1 0 1 1-1.1 2Z" />
    </svg>
  );
}

/** Outline pill with the green Spotify mark, like "Play your Spotify" on the home page. */
export function ConnectButton({ playback = false, label }: { playback?: boolean; label?: string }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <Button onClick={() => beginLogin({ playback, returnTo: window.location.pathname }).catch((e: Error) => setErr(e.message))}>
        <SpotifyLogo className="h-5 w-5 text-[#1DB954]" /> {label ?? "Connect Spotify"}
      </Button>
      {err && <p className="mt-2 text-[15px] text-error">{err}</p>}
    </div>
  );
}

/** "Use your own Spotify app": a small text button that opens a Client ID field. */
export function ClientIdSettings({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const id = useId();
  useEffect(() => setValue(getCustomClientId()), []);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="text-[15px]">
      <button type="button" aria-expanded={open} aria-controls={id} className="min-h-11 text-ink-3 hover:text-ink" onClick={() => setOpen(!open)}>
        {open ? "Hide" : "Use your own Spotify app"}
      </button>
      {open && (
        <form
          id={id}
          className="mt-1 max-w-[560px] space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setCustomClientId(value);
            logout();
            setSaved(true);
            onSaved?.();
          }}
        >
          <div className="flex gap-2">
            <TextField
              aria-label="Client ID"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setSaved(false);
              }}
              placeholder={getClientId() ? "Using the site's app" : "Client ID"}
            />
            <Button type="submit" className="shrink-0">
              {saved ? "Saved" : "Save"}
            </Button>
          </div>
          <p className="text-ink-3">
            Redirect URI <code className="rounded-md bg-card px-1.5 py-0.5 text-ink">{origin}/callback</code>
            {" · "}
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
              Spotify dashboard
            </a>
          </p>
        </form>
      )}
    </div>
  );
}
