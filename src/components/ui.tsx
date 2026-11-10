"use client";

import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "text" | "danger";

/** Pill buttons. Primary is the red of the Play button; one per screen. */
export function Button({ variant = "secondary", className, ...rest }: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 text-[16px] font-semibold transition-[background-color,transform,box-shadow] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "min-h-14 rounded-full bg-red px-7 text-[18px] text-paper hover:bg-[#9e2c2c]",
        variant === "secondary" && "min-h-12 rounded-full border-[1.5px] border-ink px-6 text-ink hover:bg-card",
        variant === "text" && "px-0 text-ink-2 hover:text-ink",
        variant === "danger" && "px-0 text-error hover:underline",
        className,
      )}
    />
  );
}

/** One option in a choice line: plain text, underlined when selected. */
export function Chip({ selected, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={cx(
        "inline-flex min-h-11 items-center rounded-full border-[1.5px] px-[18px] text-[16px] transition-colors",
        selected ? "border-ink bg-ink font-semibold text-paper" : "border-rule-strong text-ink hover:border-ink",
        className,
      )}
    />
  );
}

/** Wraps Chips as a line of text options. */
export function ChoiceLine({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex flex-wrap items-center gap-2.5", className)}>{children}</div>;
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3.5 py-3">
      <span className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-5 w-5 rounded-[5px] border-[1.5px] border-ink bg-field transition-colors peer-checked:border-blue peer-checked:bg-blue peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink" />
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute inset-0 h-5 w-5 text-paper opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M5 10.5l3.2 3L15 6.5" />
        </svg>
      </span>
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-sm text-ink-2">{hint}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <ChoiceLine>
      {options.map((o) => (
        <Chip key={o.value} selected={value === o.value} onClick={() => onChange(o.value)} role="radio" aria-checked={value === o.value}>
          {o.label}
        </Chip>
      ))}
    </ChoiceLine>
  );
}

/** A ruled section: heavy rule, heading, optional right-hand summary. */
export function Section({ title, subtitle, children, right }: { title: string; subtitle?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3">
        <h2 className="hand text-[34px] leading-tight">{title}</h2>
        {right ?? (subtitle && <p className="text-sm text-ink-2">{subtitle}</p>)}
      </div>
      {children}
    </section>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  const cls = "mb-1 block font-semibold";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={cls}>
      {children}
    </label>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export function NumberField({ value, onChange, min, max, step, suffix, placeholder, className, id }: { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; suffix?: string; placeholder?: string; className?: string; id?: string }) {
  return (
    <span className={cx("inline-flex h-11 items-center rounded-xl border-[1.5px] border-rule-strong bg-field focus-within:border-ink [&_input]:focus-visible:outline-none", className)}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className="h-full w-full min-w-0 bg-transparent px-3 text-base text-ink outline-none placeholder:text-ink-3 tabular"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") return onChange(null);
          const n = Number(v);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
      {suffix && <span className="pr-3 text-sm text-ink-3">{suffix}</span>}
    </span>
  );
}

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "h-12 w-full min-w-0 rounded-xl border-[1.5px] border-rule-strong bg-field px-4 text-base text-ink outline-none placeholder:text-ink-3 focus:border-ink focus-visible:outline-none",
        props.className,
      )}
    />
  );
}

/** A blinking block cursor, used wherever something is loading. */
export function Spinner({ className }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={cx("animate-blink inline-block h-[1em] w-[0.5em] bg-current align-[-0.15em]", className)} />;
}

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" className={cx("h-[22px] w-[22px]", className)} aria-hidden>
      <rect width="22" height="22" fill="currentColor" />
      <rect x="9.5" y="4" width="3" height="14" className="fill-paper" />
    </svg>
  );
}

/** The wordmark, hand-lettered. */
export function Logo({ className }: { className?: string }) {
  return <span className={cx("hand inline-block text-[34px] leading-none text-ink", className)}>Earshot</span>;
}

/** Small key-cap hint, desktop only. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="hidden font-sans text-[13px] font-medium opacity-70 sm:inline">{children}</kbd>;
}
