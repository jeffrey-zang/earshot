import { NextRequest, NextResponse } from "next/server";

// Deezer's public API has no CORS headers, so the browser goes through this thin proxy.
// Only read-only catalog endpoints are allowed.
const ALLOWED = /^(search(\/(track|artist|album|playlist))?|track\/\d+|album\/\d+(\/tracks)?|artist\/\d+(\/(top|albums))?|playlist\/\d+(\/tracks)?|chart\/\d+(\/tracks)?)$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const p = path.join("/");
  if (!ALLOWED.test(p)) {
    return NextResponse.json({ error: "path not allowed" }, { status: 400 });
  }
  const qs = new URLSearchParams();
  for (const key of ["q", "limit", "index", "order"]) {
    const v = req.nextUrl.searchParams.get(key);
    if (v != null) qs.set(key, v.slice(0, 200));
  }
  try {
    const res = await fetch(`https://api.deezer.com/${p}${qs.size ? `?${qs}` : ""}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const body = await res.text();
    // Preview URLs inside responses expire after ~15 minutes, so keep CDN caching short.
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, s-maxage=120, stale-while-revalidate=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }
}
