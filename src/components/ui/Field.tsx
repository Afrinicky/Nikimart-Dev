import type { ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-sm font-medium text-niki-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-niki-ink/50">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-niki-ink outline-none transition-colors placeholder:text-niki-ink/40 focus:border-niki-orange focus:ring-2 focus:ring-niki-orange/20";
