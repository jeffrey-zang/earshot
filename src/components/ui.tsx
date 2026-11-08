"use client";

import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "ghost" | "subtle" | "danger";

export function Button({ variant = "subtle", className, ...rest }: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-accent text-ink hover:brightness-110 active:brightness-95",
        variant === "subtle" && "bg-panel2 text-fg ring-1 ring-line hover:bg-[#232731]",
        variant === "ghost" && "text-dim hover:bg-panel2 hover:text-fg",
        variant === "danger" && "bg-bad/15 text-bad ring-1 ring-bad/30 hover:bg-bad/25",
        className,
      )}
    />
  );
}

export function Chip({ selected, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={cx(
        "rounded-full px-3 py-1.5 text-sm transition ring-1",
        selected ? "bg-accent/15 text-accent2 ring-accent/50" : "bg-panel2 text-dim ring-line hover:text-fg",
        className,
      )}
    />
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1.5">
      <span>
        <span className="text-sm text-fg">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-dim">{hint}</span>}
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-6 w-10 rounded-full bg-line transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent2" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-fg transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl bg-panel2 p-1 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx("rounded-lg px-3 py-1.5 text-sm transition", value === o.value ? "bg-fg text-ink font-semibold" : "text-dim hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, subtitle, children, right }: { title: string; subtitle?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-panel p-5 ring-1 ring-line sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-dim">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">{children}</div>;
}

export function NumberField({ value, onChange, min, max, step, suffix, placeholder, className }: { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; suffix?: string; placeholder?: string; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-xl bg-panel2 ring-1 ring-line focus-within:ring-accent/60", className)}>
      <input
        type="number"
        inputMode="decimal"
        className="w-full min-w-0 bg-transparent px-3 py-2 text-sm text-fg outline-none placeholder:text-faint tabular"
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
      {suffix && <span className="pr-3 text-sm text-faint">{suffix}</span>}
    </span>
  );
}

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-xl bg-panel2 px-3 py-2.5 text-sm text-fg outline-none ring-1 ring-line placeholder:text-faint focus:ring-accent/60",
        props.className,
      )}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#ff7a59" />
        <rect x="7" y="14" width="2.6" height="4" rx="1.3" fill="#0b0c0f" />
        <rect x="11.6" y="10" width="2.6" height="12" rx="1.3" fill="#0b0c0f" />
        <rect x="16.2" y="6.5" width="2.6" height="19" rx="1.3" fill="#0b0c0f" />
        <rect x="20.8" y="11.5" width="2.6" height="9" rx="1.3" fill="#0b0c0f" opacity=".45" />
        <rect x="25.2" y="14.5" width="2" height="3" rx="1" fill="#0b0c0f" opacity=".25" />
      </svg>
      <span>Earshot</span>
    </span>
  );
}
