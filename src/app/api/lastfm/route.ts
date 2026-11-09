import { NextRequest, NextResponse } from "next/server";

// Play counts from Last.fm (scrobbles), which is the only public source of per-song plays.
// Needs LASTFM_API_KEY (free at https://www.last.fm/api/account/create).

export async function GET(req: NextRequest) {
  const key = process.env.LASTFM_API_KEY;
  const sp = req.nextUrl.searchParams;
  if (sp.get("status")) return NextResponse.json({ enabled: !!key });
  if (!key) return NextResponse.json({ error: "Last.fm is not configured" }, { status: 503 });
  const artist = (sp.get("artist") ?? "").slice(0, 200);
  const track = (sp.get("track") ?? "").slice(0, 200);
  const user = (sp.get("user") ?? "").slice(0, 64);
  if (!artist || !track) return NextResponse.json({ error: "artist and track are required" }, { status: 400 });
  const params = new URLSearchParams({ method: "track.getInfo", api_key: key, artist, track, autocorrect: "1", format: "json" });
  if (user) params.set("username", user);
  try {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, { cache: "no-store" });
    const data = await res.json();
    const t = data?.track;
    if (!t) return NextResponse.json({ error: data?.message ?? "not found" }, { status: 404 });
    return NextResponse.json(
      {
        playcount: Number(t.playcount ?? 0),
        listeners: Number(t.listeners ?? 0),
        userplaycount: t.userplaycount != null ? Number(t.userplaycount) : undefined,
      },
      { headers: { "cache-control": user ? "private, max-age=300" : "public, s-maxage=86400, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }
}
