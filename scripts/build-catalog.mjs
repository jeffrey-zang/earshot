// Builds public/catalog.json: a built-in song catalog with year + genre metadata.
// Sources: public Spotify editorial playlists (via embed pages) for the song list,
// Spotify track embeds for release year + artwork, Deezer for genre tags.
// Usage: node scripts/build-catalog.mjs   (Node 22+; set NODE_USE_ENV_PROXY=1 behind a proxy)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "catalog.json");

// genre codes must match src/lib/genres.ts
const PLAYLISTS = [
  { id: "37i9dQZF1DWSV3Tk4GO2fq", decade: 1950 },
  { id: "37i9dQZF1DXaKIA8E7WcJj", decade: 1960 },
  { id: "37i9dQZF1DWTJ7xPn4vNaz", decade: 1970 },
  { id: "37i9dQZF1DX4UtSsGT1Sbe", decade: 1980 },
  { id: "37i9dQZF1DXbTxeAdrVG2l", decade: 1990 },
  { id: "37i9dQZF1DX4o1oenSJRJd", decade: 2000 },
  { id: "37i9dQZF1DX5Ejj0EkURtP", decade: 2010 },
  { id: "37i9dQZF1DXcBWIGoYBM5M", decade: 2020 },
  { id: "37i9dQZF1DXbYM3nMM0oPk" },
  { id: "37i9dQZF1DWWMOmoXKqHTD" },
  { id: "37i9dQZF1DX9wC1KY45plY" },
  { id: "37i9dQZF1DWXRqgorJj26U", genre: "rock" },
  { id: "37i9dQZF1DX3oM43CtKnRV", genre: "rock", decade: 2000 },
  { id: "37i9dQZF1DX0XUsuxWHRQd", genre: "hiphop" },
  { id: "37i9dQZF1DX186v583rmzp", genre: "hiphop", decade: 1990 },
  { id: "37i9dQZF1DWY4xHQp97fN6", genre: "hiphop" },
  { id: "37i9dQZF1DX4dyzvuaRJ0n", genre: "dance" },
  { id: "37i9dQZF1DX1MUPbVKMgJE", genre: "dance" },
  { id: "37i9dQZF1DX1lVhptIYRda", genre: "country" },
  { id: "37i9dQZF1DX10zKzsJ2jva", genre: "latin" },
  { id: "37i9dQZF1DX4SBhb3fqCJd", genre: "rnb" },
  { id: "37i9dQZF1DX9tPFwDMOaN1", genre: "kpop" },
  { id: "37i9dQZF1DXbITWG1ZJKYt", genre: "jazz" },
  { id: "37i9dQZF1DWWEJlAGA9gs0", genre: "classical" },
  { id: "37i9dQZF1DWTcqUzwhNmKv", genre: "metal" },
  { id: "37i9dQZF1DXdbXrPNafg9d", genre: "indie" },
  { id: "37i9dQZF1DX2Nc3B70tvx0", genre: "indie" },
  { id: "37i9dQZF1DXaLI8a395lse", genre: "indie", decade: 1990 },
  { id: "37i9dQZF1DX2SK4ytI2KAZ", genre: "indie" },
  { id: "37i9dQZF1DXbSbnqxMTGx9", genre: "reggae" },
  { id: "37i9dQZF1DWULEW2RfoSCi", genre: "soul", decade: 1970 },
];

// Deezer genre name -> our genre code
const DEEZER_GENRES = {
  Pop: "pop", "Rap/Hip Hop": "hiphop", Reggaeton: "latin", Rock: "rock", Dance: "dance",
  "R&B": "rnb", Alternative: "indie", Electro: "dance", Folk: "folk", Reggae: "reggae",
  Jazz: "jazz", Country: "country", Salsa: "latin", "Traditional Mexicano": "latin",
  Classical: "classical", "Films/Games": "soundtrack", Metal: "metal", "Soul & Funk": "soul",
  Blues: "blues", "Latin Music": "latin", "Brazilian Music": "latin", Cumbia: "latin",
  "Asian Music": "kpop", "K-Pop": "kpop", "Indie Rock": "indie", "Indie Pop": "indie",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { json = false, tries = 4 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (catalog builder)" } });
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      if (!res.ok) return null;
      return json ? await res.json() : await res.text();
    } catch {
      await sleep(1000 * (i + 1));
    }
  }
  return null;
}

function embedEntity(html) {
  const m = html && html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]).props.pageProps.state.data.entity; } catch { return null; }
}

async function pool(items, n, fn) {
  let i = 0, done = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${items.length}`);
    }
  });
  await Promise.all(workers);
}

const norm = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s+-\s+.*$/, " ").replace(/&/g, " and ")
  .replace(/[^a-z0-9\u0080-￿]+/g, " ").trim();

// Deezer rate limit is 50 requests / 5 s
let dzTimes = [];
async function deezer(url) {
  for (;;) {
    const now = Date.now();
    dzTimes = dzTimes.filter((t) => now - t < 5200);
    if (dzTimes.length < 45) break;
    await sleep(150);
  }
  dzTimes.push(Date.now());
  const d = await get(url, { json: true });
  if (d && d.error && d.error.code === 4) { await sleep(3000); return deezer(url); }
  return d;
}

async function main() {
  const tracks = new Map();
  for (const pl of PLAYLISTS) {
    const ent = embedEntity(await get(`https://open.spotify.com/embed/playlist/${pl.id}`));
    if (!ent) { console.warn("failed playlist", pl.id); continue; }
    console.log(`${ent.name}: ${ent.trackList.length}`);
    for (const t of ent.trackList) {
      const id = t.uri.split(":").pop();
      const cur = tracks.get(id) || { id, title: t.title, artists: t.subtitle.split(/, /), dur: Math.round(t.duration / 1000), ex: t.isExplicit ? 1 : 0, prev: t.audioPreview?.url?.split("/").pop() || "", genres: new Set(), decades: new Set() };
      if (pl.genre) cur.genres.add(pl.genre);
      if (pl.decade) cur.decades.add(pl.decade);
      tracks.set(id, cur);
    }
  }
  const list = [...tracks.values()];
  console.log(`unique tracks: ${list.length}`);

  console.log("track embeds (year, artwork)...");
  await pool(list, 6, async (t) => {
    const ent = embedEntity(await get(`https://open.spotify.com/embed/track/${t.id}`));
    if (!ent) return;
    if (ent.artists?.length) t.artists = ent.artists.map((a) => a.name);
    if (ent.title) t.title = ent.title;
    const iso = ent.releaseDate?.isoString;
    if (iso) t.year = parseInt(iso.slice(0, 4), 10);
    const img = ent.visualIdentity?.image?.find((i) => i.maxWidth === 300) || ent.visualIdentity?.image?.[0];
    const m = img?.url?.match(/ab67616d0000[0-9a-f]{4}([0-9a-f]{24})/);
    if (m) t.img = m[1];
    if (ent.audioPreview?.url) t.prev = ent.audioPreview.url.split("/").pop();
  });

  console.log("deezer genres...");
  const albumGenres = new Map();
  await pool(list, 4, async (t) => {
    const q = `${t.artists[0]} ${t.title.replace(/\s+-\s+.*$/, "").replace(/\(.*?\)/g, "")}`;
    const res = await deezer(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`);
    const nt = norm(t.title), na = norm(t.artists[0]);
    const hit = res?.data?.find((d) => norm(d.title) === nt && norm(d.artist.name) === na)
      || res?.data?.find((d) => norm(d.title) === nt);
    if (!hit) return;
    t.dz = hit.id;
    const aid = hit.album.id;
    if (!albumGenres.has(aid)) {
      const al = await deezer(`https://api.deezer.com/album/${aid}`);
      albumGenres.set(aid, (al?.genres?.data || []).map((g) => g.name));
    }
    for (const g of albumGenres.get(aid)) {
      const code = DEEZER_GENRES[g];
      if (code) t.genres.add(code);
    }
  });

  let fixed = 0;
  const out = list.filter((t) => t.prev).map((t) => {
    // Compilation / reissue dates can disagree with the playlist decade; trust the decade then.
    const decades = [...t.decades];
    let year = t.year || 0;
    if (decades.length && year && !decades.some((d) => year >= d && year <= d + 9)) {
      const d = Math.min(...decades);
      if (year > d + 9) { year = 0; fixed++; }
    }
    return [t.id, t.title, t.artists.join("|"), year, decades.length ? Math.min(...decades) : 0, [...t.genres].join(","), t.prev, t.dur, t.ex, t.dz || 0, t.img || ""];
  });
  console.log(`decade-overridden years: ${fixed}`);
  writeFileSync(OUT, JSON.stringify({
    v: 1,
    built: new Date().toISOString().slice(0, 10),
    fields: ["spotifyId", "title", "artists", "year", "decade", "genres", "previewId", "durationSec", "explicit", "deezerId", "imageId"],
    tracks: out,
  }));
  console.log(`wrote ${out.length} tracks to ${OUT}`);
}

main();
