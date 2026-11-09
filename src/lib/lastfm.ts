import type { Track } from "./types";

let status: Promise<boolean> | null = null;

/** Whether the server has a Last.fm API key configured. */
export function lastfmEnabled(): Promise<boolean> {
  if (!status) {
    status = fetch("/api/lastfm?status=1")
      .then((r) => r.json())
      .then((d) => !!d.enabled)
      .catch(() => false);
  }
  return status;
}

export async function fetchLastfm(t: Track, user?: string): Promise<Track["lastfm"] | null> {
  const params = new URLSearchParams({ artist: t.artists[0] ?? "", track: t.title.replace(/\s+[-–—]\s+.*$/, "").replace(/\(.*?\)/g, "").trim() });
  if (user) params.set("user", user);
  try {
    const res = await fetch(`/api/lastfm?${params}`);
    if (!res.ok) return null;
    const d = await res.json();
    if (typeof d.playcount !== "number") return null;
    return { playcount: d.playcount, listeners: d.listeners ?? 0, userplaycount: typeof d.userplaycount === "number" ? d.userplaycount : undefined };
  } catch {
    return null;
  }
}
