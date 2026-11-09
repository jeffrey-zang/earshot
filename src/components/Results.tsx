"use client";

import { useState } from "react";
import type { GameSettings, RoundResult } from "@/lib/types";
import { formatSeconds } from "@/lib/scoring";
import { cleanTitle } from "@/lib/text";
import { canShare, encodeChallenge, makeChallenge } from "@/lib/challenge";
import { FIELD_INFO, HL_INFO, describeMode, formatCount, formatMonth } from "@/lib/modes";
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

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString()}`;

export function Results({ results, settings, seed, note, challengeScore, onReplay, onNewGame }: Props) {
  const total = results.reduce((a, r) => a + r.points, 0);
  const solved = results.filter((r) => r.solved);
  const mode = settings.mode ?? "classic";
  const perRound = mode === "classic" ? settings.maxPoints * Math.max(1, settings.fields?.length ?? 1) : mode === "lyrics" ? settings.maxPoints : 100;
  const best = results.length * perRound;
  const titleOnly = mode === "classic" && (settings.fields?.length ?? 1) === 1 && (settings.fields?.[0] ?? "title") === "title";
  const shareable = canShare(settings);
  const longestStreak = results.reduce((acc, r) => (r.solved ? { cur: acc.cur + 1, max: Math.max(acc.max, acc.cur + 1) } : { cur: 0, max: acc.max }), { cur: 0, max: 0 }).max;
  const challengeTracks = mode === "higherlower" && results[0]?.versus ? [results[0].versus.track, ...results.map((r) => r.track)] : results.map((r) => r.track);
  const avg = solved.length ? solved.reduce((a, r) => a + r.listened, 0) / solved.length : 0;
  const [copied, setCopied] = useState<string | null>(null);

  const challengeUrl = () => `${window.location.origin}/play?c=${encodeChallenge(makeChallenge(challengeTracks, settings, seed, total))}`;

  async function copy(what: "link" | "text") {
    const lines = [
      mode === "higherlower" ? `Earshot ${describeMode(settings)}: ${longestStreak} in a row` : `Earshot ${describeMode(settings)}: ${total.toLocaleString()} pts, ${solved.length}/${results.length}`,
      results.map((r) => (r.solved ? (r.listened <= 0.5 ? "■" : r.listened <= 2 ? "▣" : "□") : "×")).join(""),
    ];
    const text = what === "link" ? challengeUrl() : shareable ? `${lines.join("\n")}\nBeat me: ${challengeUrl()}` : lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  const verdict =
    challengeScore == null
      ? null
      : total > challengeScore
        ? `You beat ${challengeScore.toLocaleString()} by ${(total - challengeScore).toLocaleString()}`
        : total === challengeScore
          ? `Dead even with ${challengeScore.toLocaleString()}`
          : `${(challengeScore - total).toLocaleString()} short of ${challengeScore.toLocaleString()}`;

  return (
    <div className="mx-auto max-w-xl px-5 pb-16 tabular">
      <header className="flex h-14 items-center justify-between">
        <Logo className="text-lg" />
        <span className="text-sm text-ink-2">
          {results.length} round{results.length === 1 ? "" : "s"}
        </span>
      </header>

      <section className="animate-rise pt-5" aria-live="polite">
        <div className="text-[15px] text-ink-2">Final score</div>
        <div className={cx("numeral text-[120px] leading-[0.85] sm:text-[152px]", total < 0 && "text-error")}>{total < 0 ? `−${Math.abs(total).toLocaleString()}` : total.toLocaleString()}</div>
        <p className="mt-3 text-[15px] text-ink-2">
          <span className="font-semibold text-ink">{describeMode(settings)}</span>
          {" · "}
          {mode === "higherlower" ? (
            <>
              {solved.length} of {results.length} right · best run {longestStreak}
            </>
          ) : mode === "lyrics" ? (
            <>
              {solved.length} of {results.length} word for word · {Math.round((Math.max(0, total) / Math.max(1, best)) * 100)}% of max
            </>
          ) : (
            <>
              {solved.length} of {results.length} {titleOnly ? "named" : "fully right"}
              {titleOnly && solved.length > 0 && ` · ${formatSeconds(avg)} average`} · {Math.round((Math.max(0, total) / Math.max(1, best)) * 100)}% of max
            </>
          )}
        </p>
        {verdict && <p className="mt-3 inline-block border-2 border-ink px-2.5 py-1 text-sm font-semibold">{verdict}</p>}
        {note && <p className="mt-3 text-sm text-ink-2">{note}</p>}
      </section>

      {mode !== "higherlower" && results.some((r) => r.points > 0) && results.length <= 50 && <PointsChart results={results} max={perRound} />}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button variant="primary" className="h-[52px] text-base" onClick={onReplay}>
          Play again
        </Button>
        <Button className="h-[52px] text-base" onClick={onNewGame}>
          New game
        </Button>
      </div>
      <div className="mt-1 flex justify-between gap-2">
        <Button variant="text" onClick={() => copy("text")} disabled={!results.length}>
          {copied === "text" ? "Copied" : "Share score"}
        </Button>
        {shareable && (
          <Button variant="text" onClick={() => copy("link")} disabled={!results.length}>
            {copied === "link" ? "Copied" : "Copy challenge link"}
          </Button>
        )}
      </div>
      <p className="text-sm text-ink-2">
        {shareable ? "A challenge link lets anyone play these exact songs, no Spotify login needed." : "Questions about your own library can't be shared as a challenge."}
      </p>

      <ol className="mt-6 border-t-2 border-ink">
        {results.map((r, i) => (
          <li key={i} className="grid grid-cols-[24px_44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2.5">
            <span className="text-[13px] font-semibold text-ink-3 condensed">{String(i + 1).padStart(2, "0")}</span>
            {r.track.image ? <img src={r.track.image} alt="" className="h-11 w-11 object-cover" /> : <span className="h-11 w-11 bg-paper-2" />}
            <span className="min-w-0">
              <span className={cx("block truncate text-[15px] font-semibold", !r.solved && "text-ink-2")}>{cleanTitle(r.track.title)}</span>
              <span className="block truncate text-[13px] text-ink-2">
                {r.track.artists.join(", ")}
                {r.track.year ? ` · ${r.track.year}` : ""}
              </span>
              <RowDetail r={r} />
            </span>
            <span className="text-right">
              <span className={cx("block text-[15px] font-bold", r.points < 0 ? "text-error" : r.points === 0 && "text-ink-2")}>{signed(r.points)}</span>
              <span className="block text-xs text-ink-2">
                {r.versus ? (r.solved ? "right" : "wrong") : r.lyric ? `${Math.round(r.lyric.similarity * 100)}%` : r.fields && !titleOnly ? `${r.fields.filter((f) => f.outcome === "right").length}/${r.fields.length}` : r.solved ? formatSeconds(r.listened) : "missed"}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One bar per round: height is points, labels are how much audio it took. */
function PointsChart({ results, max }: { results: RoundResult[]; max: number }) {
  const dense = results.length > 15;
  return (
    <figure className="mt-6">
      <div className="grid h-24 items-end gap-1 border-b-2 border-ink" style={{ gridTemplateColumns: `repeat(${results.length}, minmax(0, 1fr))` }}>
        {results.map((r, i) => (
          <span
            key={i}
            title={`Round ${i + 1}: ${signed(r.points)}`}
            className={r.points > 0 ? "bg-ink" : "bg-tick"}
            style={{ height: r.points > 0 ? `${Math.max(4, (r.points / max) * 100)}%` : "2px" }}
          />
        ))}
      </div>
      {!dense && (
        <div className="mt-1 grid gap-1 text-center text-[11px] font-semibold text-ink-3 condensed" style={{ gridTemplateColumns: `repeat(${results.length}, minmax(0, 1fr))` }} aria-hidden>
          {results.map((r, i) => (
            <span key={i}>{r.solved ? formatSeconds(r.listened).replace(/s$/, "") : "—"}</span>
          ))}
        </div>
      )}
      <figcaption className="sr-only">Points per round</figcaption>
    </figure>
  );
}

/** Mode-specific line under each result row. */
function RowDetail({ r }: { r: RoundResult }) {
  if (r.versus) {
    const v = r.versus;
    const fmt = (n: number) => (v.metric === "added" ? formatMonth(new Date(n).toISOString()) : v.metric === "year" ? String(n) : formatCount(n));
    return (
      <span className="block truncate text-[13px] text-ink-2">
        {fmt(v.b)} vs {fmt(v.a)} · you said {v.choice === "higher" ? HL_INFO[v.metric].higher.toLowerCase() : HL_INFO[v.metric].lower.toLowerCase()}
      </span>
    );
  }
  if (r.lyric) return <span className="block truncate text-[13px] italic text-ink-2">&ldquo;{r.lyric.line}&rdquo;</span>;
  if (r.fields && r.fields.length > 1) {
    return (
      <span className="block truncate text-[13px] text-ink-2">
        {r.fields.map((f) => `${FIELD_INFO[f.field].short} ${f.outcome === "right" ? "right" : f.outcome === "close" ? `close (${f.detail})` : "missed"}`).join(" · ")}
      </span>
    );
  }
  return null;
}
