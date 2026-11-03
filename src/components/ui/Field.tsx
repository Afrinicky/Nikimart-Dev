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

/**
 * The input's look, with no width of its own.
 *
 * `cn` is plain clsx — it does not resolve Tailwind conflicts — so an input
 * styled with `inputClass` and then given `w-36` carries both classes, and
 * which one wins is decided by the order Tailwind emits them rather than by
 * the order they were written. That is how a row of controls ends up with one
 * field at full width and its neighbour collapsed to nothing. Anything laid
 * out in a row sets its own width and uses this; `inputClass` stays the
 * full-width default for a field in a column.
 */
export const inputBase =
  "rounded-xl border border-niki-edge-strong bg-white px-4 py-2.5 text-sm text-niki-ink outline-none transition-colors placeholder:text-niki-ink/40 focus:border-niki-orange focus:ring-2 focus:ring-niki-orange/20";

export const inputClass = `w-full ${inputBase}`;
