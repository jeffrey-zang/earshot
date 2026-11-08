"use client";

import { useState } from "react";
import type { GameSettings, RoundResult } from "@/lib/types";
import { formatSeconds } from "@/lib/scoring";
import { cleanTitle } from "@/lib/text";
import { encodeChallenge, makeChallenge } from "@/lib/challenge";
import { Button, Logo, cx } from "./ui";

interface Props {
  results: RoundResult[];
  settings: GameSettings;
  seed: number;
  note?: string;
  challengeScore?: number;
  onReplay: () => void;
  onNewGame: () => void;
}

export function Results({ results, settings, seed, note, challengeScore, onReplay, onNewGame }: Props) {
  const total = results.reduce((a, r) => a + r.points, 0);
  const solved = results.filter((r) => r.solved);
  const best = results.length * settings.maxPoints;
  const avg = solved.length ? solved.reduce((a, r) => a + r.listened, 0) / solved.length : 0;
  const [copied, setCopied] = useState<string | null>(null);

  const challengeUrl = () => `${window.location.origin}/play?c=${encodeChallenge(makeChallenge(results.map((r) => r.track), settings, seed, total))}`;

  async function copy(what: "link" | "text") {
    const lines = [
      `Earshot: ${total.toLocaleString()} pts, ${solved.length}/${results.length} songs`,
      results.map((r) => (r.solved ? (r.listened <= 0.5 ? "■" : r.listened <= 2 ? "▣" : "□") : "×")).join(""),
    ];
    const text = what === "link" ? challengeUrl() : `${lines.join("\n")}\nBeat me: ${challengeUrl()}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-8">
      <Logo className="text-lg" />
      <div className="animate-pop mt-10 text-center">
        <div className="text-sm font-semibold uppercase tracking-wider text-dim">Final score</div>
        <div className="mt-2 text-6xl font-bold tracking-tight tabular">{total.toLocaleString()}</div>
        <div className="mt-2 text-sm text-dim tabular">
          {solved.length} of {results.length} songs · {Math.round((Math.max(0, total) / Math.max(1, best)) * 100)}% of max
          {solved.length > 0 && ` · avg ${formatSeconds(avg)} to solve`}
        </div>
        {challengeScore != null && (
          <div className={cx("mt-4 inline-block rounded-full px-4 py-1.5 text-sm font-semibold", total > challengeScore ? "bg-good/15 text-good" : total === challengeScore ? "bg-gold/15 text-gold" : "bg-bad/15 text-bad")}>
            {total > challengeScore ? `You beat ${challengeScore.toLocaleString()}` : total === challengeScore ? "Dead even" : `${(challengeScore - total).toLocaleString()} short of ${challengeScore.toLocaleString()}`}
          </div>
        )}
        {note && <p className="mt-4 text-sm text-gold">{note}</p>}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={onReplay}>Play again</Button>
        <Button onClick={onNewGame}>Change settings</Button>
        <Button onClick={() => copy("text")} disabled={!results.length}>{copied === "text" ? "Copied" : "Share score"}</Button>
        <Button onClick={() => copy("link")} disabled={!results.length}>{copied === "link" ? "Copied" : "Copy challenge link"}</Button>
      </div>
      <p className="mt-2 text-center text-xs text-faint">A challenge link lets anyone play these exact songs, no Spotify login needed.</p>

      <ol className="mt-8 space-y-2">
        {results.map((r, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl bg-panel p-3 ring-1 ring-line">
            <span className="w-5 shrink-0 text-center text-xs text-faint tabular">{i + 1}</span>
            {r.track.image ? <img src={r.track.image} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" /> : <span className="h-11 w-11 shrink-0 rounded-md bg-line" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{cleanTitle(r.track.title)}</div>
              <div className="truncate text-xs text-dim">
                {r.track.artists.join(", ")}
                {r.track.year ? ` · ${r.track.year}` : ""}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className={cx("text-sm font-semibold tabular", r.points > 0 ? "text-fg" : r.points < 0 ? "text-bad" : "text-faint")}>
                {r.points > 0 ? "+" : ""}
                {r.points.toLocaleString()}
              </div>
              <div className={cx("text-xs tabular", r.solved ? "text-good" : "text-faint")}>{r.solved ? formatSeconds(r.listened) : "missed"}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
