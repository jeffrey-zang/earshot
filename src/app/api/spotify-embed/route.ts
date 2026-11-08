import { NextRequest, NextResponse } from "next/server";

// Reads the public Spotify embed page for a playlist/album/artist/track and returns its track list.
// This needs no Spotify login or API key, which makes "paste a link" work for anyone.
// Limits: playlists return up to 100 tracks, artists their top 10.

interface EmbedTrack {
  uri: string;
  title: string;
  subtitle?: string;
  artists?: { name: string }[];
  duration?: number;
  isExplicit?: boolean;
  audioPreview?: { url?: string } | null;
  releaseDate?: { isoString?: string } | null;
  visualIdentity?: { image?: { url: string; maxWidth: number }[] };
}

const TYPES = new Set(["playlist", "album", "artist", "track"]);

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!TYPES.has(type) || !/^[A-Za-z0-9]{10,40}$/.test(id)) {
    return NextResponse.json({ error: "bad type or id" }, { status: 400 });
  }
  let html: string;
  try {
    const res = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Earshot/1.0)", "accept-language": "en" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: `spotify returned ${res.status}` }, { status: res.status === 404 ? 404 : 502 });
    html = await res.text();
  } catch {
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return NextResponse.json({ error: "could not read embed" }, { status: 502 });
  let entity: (EmbedTrack & { type: string; name?: string; trackList?: EmbedTrack[]; coverArt?: { sources?: { url: string }[] } }) | undefined;
  try {
    entity = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
  } catch {
    /* fallthrough */
  }
  if (!entity) return NextResponse.json({ error: "not found" }, { status: 404 });

  const toTrack = (t: EmbedTrack) => {
    const img = t.visualIdentity?.image?.find((i) => i.maxWidth === 300) ?? t.visualIdentity?.image?.[0];
    return {
      id: t.uri.split(":").pop(),
      title: t.title,
      artists: t.artists?.map((a) => a.name) ?? (t.subtitle ? t.subtitle.split(/, |, /) : []),
      durationMs: t.duration,
      explicit: !!t.isExplicit,
      previewUrl: t.audioPreview?.url ?? null,
      year: t.releaseDate?.isoString ? parseInt(t.releaseDate.isoString.slice(0, 4), 10) : null,
      image: img?.url ?? null,
    };
  };

  const tracks = type === "track" ? [toTrack(entity)] : (entity.trackList ?? []).filter((t) => t.uri?.startsWith("spotify:track:")).map(toTrack);
  return NextResponse.json(
    {
      type,
      id,
      name: entity.name ?? entity.title ?? "",
      image: entity.coverArt?.sources?.[0]?.url ?? tracks[0]?.image ?? null,
      tracks,
    },
    { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
