"use client";

import { useState } from "react";
import { MONTH_NAMES, parseCount } from "@/lib/modes";
import { cx } from "./ui";

const box =
  "h-14 rounded-xl border-2 border-ink bg-field px-4 text-[18px] text-ink caret-red outline-none transition-shadow placeholder:text-ink-3 focus:shadow-[0_0_0_5px_rgb(31_80_176/0.18)] focus-visible:outline-none tabular";
const lockBtn = "h-14 shrink-0 rounded-full border-[1.5px] border-ink px-6 text-[16px] font-semibold text-ink transition-colors hover:bg-card disabled:opacity-40 disabled:hover:bg-transparent";
/** The only question: as big as the song-title box, with Lock in inside it. */
const bigBox =
  "h-16 w-full min-w-0 rounded-[14px] border-2 border-ink bg-field pl-5 pr-32 text-[21px] text-ink caret-red outline-none transition-shadow placeholder:text-ink-3 focus:shadow-[0_0_0_5px_rgb(31_80_176/0.18)] focus-visible:outline-none sm:h-20 sm:pl-6 sm:text-[26px] tabular";
const bigLock =
  "absolute right-2.5 top-1/2 h-11 -translate-y-1/2 rounded-full bg-ink px-5 text-[16px] font-semibold text-paper transition-opacity disabled:opacity-25 sm:right-3 sm:h-14 sm:px-6 sm:text-[17px]";

/** A native select, drawn like the text boxes. */
function Select({ id, value, onChange, children }: { id: string; value: number; onChange: (v: number) => void; children: React.ReactNode }) {
  return (
    <span className="relative flex min-w-0 flex-1">
      <select id={id} value={value} onChange={(e) => onChange(+e.target.value)} className={cx(box, "w-full min-w-0 appearance-none pr-10")}>
        {children}
      </select>
      <svg viewBox="0 0 12 8" className="pointer-events-none absolute right-4 top-1/2 h-2 w-3 -translate-y-1/2 text-ink" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M1 1.5l5 5 5-5" />
      </svg>
    </span>
  );
}

/** A year, locked in once. Arrow keys nudge it. */
export function YearInput({ onSubmit, onEmptySpace, big }: { onSubmit: (year: number) => void; onEmptySpace?: () => void; big?: boolean }) {
  const [v, setV] = useState("");
  const n = parseInt(v, 10);
  const valid = n >= 1900 && n <= 2100;
  return (
    <form
      className={big ? "relative" : "flex gap-2.5"}
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
        placeholder={big ? "Release year" : "Year, e.g. 1987"}
        enterKeyHint="done"
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
        className={big ? bigBox : cx(box, "w-full min-w-0 flex-1")}
      />
      <button type="submit" disabled={!valid} className={big ? bigLock : lockBtn}>
        Lock in
      </button>
    </form>
  );
}

/** A play count, accepting "2.5m" or "300k". */
export function CountInput({ id, label, placeholder, onSubmit, onEmptySpace, big }: { id: string; label: string; placeholder: string; onSubmit: (n: number) => void; onEmptySpace?: () => void; big?: boolean }) {
  const [v, setV] = useState("");
  const n = parseCount(v);
  return (
    <form
      className={big ? "relative" : "flex gap-2.5"}
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
        className={big ? bigBox : cx(box, "w-full min-w-0 flex-1")}
      />
      <button type="submit" disabled={n == null} className={big ? bigLock : lockBtn}>
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
      className="flex gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(year * 12 + month);
      }}
    >
      <label className="sr-only" htmlFor="guess-month">
        Month
      </label>
      <Select id="guess-month" value={month} onChange={setMonth}>
        {MONTH_NAMES.map((m, i) => (
          <option key={m} value={i}>
            {m}
          </option>
        ))}
      </Select>
      <label className="sr-only" htmlFor="guess-month-year">
        Year
      </label>
      <Select id="guess-month-year" value={year} onChange={setYear}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
      <button type="submit" className={lockBtn}>
        Lock in
      </button>
    </form>
  );
}

/** Pick one option (e.g. which playlist). */
export function ChoiceInput({ options, onPick }: { options: string[]; onPick: (o: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o, i) => (
        <button key={o} type="button" onClick={() => onPick(o)} className="flex min-h-14 items-center gap-3 rounded-xl border-[1.5px] border-ink bg-field px-4 text-left text-[16px] font-semibold text-ink transition-colors hover:bg-card">
          {i < 9 && <span className="hidden text-[14px] font-medium text-ink-3 sm:inline">{i + 1}</span>}
          <span className="truncate">{o}</span>
        </button>
      ))}
    </div>
  );
}
