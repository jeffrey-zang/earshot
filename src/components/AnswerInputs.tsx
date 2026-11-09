"use client";

import { useState } from "react";
import { MONTH_NAMES, parseCount } from "@/lib/modes";
import { cx } from "./ui";

const box = "h-12 border-2 border-ink bg-field px-3.5 text-[17px] text-ink outline-none focus:bg-white focus-visible:outline-none placeholder:text-ink-3 tabular";
const lockBtn = "h-12 bg-ink px-5 text-base font-bold text-paper transition-colors hover:bg-black disabled:opacity-30";

/** A year, locked in once. Arrow keys nudge it. */
export function YearInput({ onSubmit, onEmptySpace }: { onSubmit: (year: number) => void; onEmptySpace?: () => void }) {
  const [v, setV] = useState("");
  const n = parseInt(v, 10);
  const valid = n >= 1900 && n <= 2100;
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(n);
      }}
    >
      <label htmlFor="guess-year" className="sr-only">
        Release year
      </label>
      <input
        id="guess-year"
        inputMode="numeric"
        value={v}
        maxLength={4}
        placeholder="Year, e.g. 1987"
        onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => {
          if (e.key === " " && !v && onEmptySpace) {
            e.preventDefault();
            onEmptySpace();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = valid ? n : 2000;
            setV(String(base + (e.key === "ArrowUp" ? 1 : -1)));
          }
        }}
        className={cx(box, "w-full min-w-0 flex-1")}
      />
      <button type="submit" disabled={!valid} className={lockBtn}>
        Lock in
      </button>
    </form>
  );
}

/** A play count, accepting "2.5m" or "300k". */
export function CountInput({ id, label, placeholder, onSubmit, onEmptySpace }: { id: string; label: string; placeholder: string; onSubmit: (n: number) => void; onEmptySpace?: () => void }) {
  const [v, setV] = useState("");
  const n = parseCount(v);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (n != null) onSubmit(n);
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === " " && !v && onEmptySpace) {
            e.preventDefault();
            onEmptySpace();
          }
        }}
        className={cx(box, "w-full min-w-0 flex-1")}
      />
      <button type="submit" disabled={n == null} className={lockBtn}>
        Lock in
      </button>
    </form>
  );
}

/** Month + year, submitted as a month index (year * 12 + month). */
export function MonthInput({ minYear, onSubmit }: { minYear: number; onSubmit: (monthIndex: number) => void }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const years: number[] = [];
  for (let y = now.getFullYear(); y >= Math.min(minYear, now.getFullYear()); y--) years.push(y);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(year * 12 + month);
      }}
    >
      <label className="sr-only" htmlFor="guess-month">
        Month
      </label>
      <select id="guess-month" value={month} onChange={(e) => setMonth(+e.target.value)} className={cx(box, "min-w-0 flex-1")}>
        {MONTH_NAMES.map((m, i) => (
          <option key={m} value={i}>
            {m}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="guess-month-year">
        Year
      </label>
      <select id="guess-month-year" value={year} onChange={(e) => setYear(+e.target.value)} className={cx(box, "min-w-0 flex-1")}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button type="submit" className={lockBtn}>
        Lock in
      </button>
    </form>
  );
}

/** Pick one option (e.g. which playlist). */
export function ChoiceInput({ options, onPick }: { options: string[]; onPick: (o: string) => void }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onPick(o)} className="min-h-12 truncate border-2 border-ink bg-field px-3.5 text-left text-[15px] font-semibold hover:bg-ink hover:text-paper">
          {o}
        </button>
      ))}
    </div>
  );
}
