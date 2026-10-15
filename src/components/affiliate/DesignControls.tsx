"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The controls both designers are built from.
 *
 * A design editor is a hundred small inputs, and a hundred small inputs look
 * like a tax return unless they are the same five controls repeated. So: one
 * slider with its number beside it, one picker, one colour well that can say
 * "whatever the theme says", one switch, and one disclosure to fold a group
 * away. Nothing here knows what a flyer is.
 */

export function Section({
  title,
  hint,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl bg-white ring-1 ring-niki-edge [&[open]>summary]:border-b [&[open]>summary]:border-niki-edge"
    >
      <summary className="niki-focus flex cursor-pointer list-none items-center gap-2 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-niki-ink">{title}</span>
          {hint ? (
            <span className="mt-0.5 block text-[11px] leading-relaxed text-niki-ink/50">{hint}</span>
          ) : null}
        </span>
        {badge}
        <ChevronDown className="h-4 w-4 shrink-0 text-niki-ink/40 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 px-4 py-4">{children}</div>
    </details>
  );
}

/** A number with a slider, because a size is a feel rather than a figure. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-niki-ink/70">{label}</span>
        <span className="font-mono text-[11px] text-niki-ink/45">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-niki-orange"
      />
    </label>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-niki-ink/70">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-niki-edge-strong bg-white px-2.5 text-xs font-medium text-niki-ink outline-none focus:border-niki-orange"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextField({
  label,
  value,
  placeholder,
  maxLength = 80,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-niki-ink/70">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-niki-edge-strong bg-white px-2.5 text-xs text-niki-ink outline-none focus:border-niki-orange"
      />
    </label>
  );
}

/**
 * A colour, with the option of not choosing one.
 *
 * Most of the flyer's colours come from its colourway, and the useful default
 * is "whatever that is" — so an empty value is a real state here rather than a
 * missing one, and clearing is one click rather than a guess at the theme's
 * own hex.
 */
export function ColourField({
  label,
  value,
  fallback,
  onChange,
  allowInherit = true,
}: {
  label: string;
  value: string;
  /** What the empty value actually paints, so the well is never blank. */
  fallback: string;
  onChange: (value: string) => void;
  allowInherit?: boolean;
}) {
  const inherited = value === "";
  return (
    <div className="flex items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <input
          type="color"
          value={inherited ? safeHex(fallback) : safeHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-9 shrink-0 cursor-pointer rounded-lg border border-niki-edge-strong bg-white p-0.5"
          aria-label={label}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-niki-ink/70">{label}</span>
          <span className="block font-mono text-[10px] text-niki-ink/40">
            {inherited ? "from the colourway" : value}
          </span>
        </span>
      </label>
      {allowInherit && !inherited ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="niki-press shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-niki-ink/50 ring-1 ring-niki-edge hover:bg-niki-surface"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}

/** `<input type="color">` refuses anything but #rrggbb, including "". */
function safeHex(value: string): string {
  const v = (value ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return "#000000";
}

export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-niki-orange"
      />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-niki-ink/75">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-[10px] leading-relaxed text-niki-ink/45">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

/** Two or three controls on one row, which most of these come in. */
export function Row({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={cn("grid gap-3", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>{children}</div>
  );
}
