/** Link-preview helpers shared by the /og image and page metadata (server-safe: no browser APIs). */

export interface SharedChallenge {
  t?: unknown[];
  s?: { mode?: string; fields?: string[]; twist?: string };
  score?: number;
}

/** A challenge link's ?c= code, or null if it isn't one. */
export function readChallenge(code: string | null | undefined): SharedChallenge | null {
  if (!code) return null;
  try {
    const json = Buffer.from(code.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const c = JSON.parse(json);
    return c && c.v === 1 && Array.isArray(c.t) ? c : null;
  } catch {
    return null;
  }
}

export function challengeGame(s: SharedChallenge["s"]): string {
  if (s?.mode === "lyrics") return "Finish the lyric";
  if (s?.mode === "higherlower") return "Higher or lower";
  const f = s?.fields ?? ["title"];
  if (f.length === 1 && f[0] === "year") return "Guess the year";
  if (f.length > 1) return "Song, artist and year";
  return s?.twist === "reverse" ? "Backwards" : "Name the song";
}

/** "Beat 2,410" or "Your turn", and "5 songs · Name the song". */
export function challengeText(c: SharedChallenge): { title: string; line: string } {
  const n = c.t?.length ?? 0;
  return {
    title: c.score != null ? `Beat ${c.score.toLocaleString("en-US")}` : "Your turn",
    line: `${n} ${n === 1 ? "song" : "songs"} · ${challengeGame(c.s)}`,
  };
}
