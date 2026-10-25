import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The storefront's form controls.
 *
 * The same vocabulary as the console's (`console/Field.tsx`) — a real label
 * tied by id, the hairline rather than a border, one focus ring — at the size
 * a public form needs. The console is dense on purpose: somebody works it all
 * day and a 36px control lets them see twenty fields at once. A hospital's
 * procurement officer fills this form once, probably on a telephone, where a
 * 36px target is a mis-tap and 13px text is a squint.
 *
 * So: 44px controls, 15px text, and the same everything else.
 */

const CONTROL =
  "medi-focus w-full rounded-lg bg-white px-3.5 text-[0.9375rem] text-medi-ink " +
  "shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] placeholder:text-medi-muted " +
  "disabled:bg-medi-surface disabled:text-medi-muted";

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="medi-label mb-1.5 block text-medi-ink">
        {label}
        {required ? (
          <span className="ml-0.5 text-medi-danger" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="medi-meta mt-1.5 text-medi-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="medi-meta mt-1.5 text-medi-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextBox({
  id,
  className,
  ...props
}: React.ComponentProps<"input"> & { id: string }) {
  return (
    <input
      id={id}
      name={props.name ?? id}
      {...props}
      className={cn(CONTROL, "h-11", className)}
    />
  );
}

export function SelectBox({
  id,
  className,
  children,
  ...props
}: React.ComponentProps<"select"> & { id: string }) {
  return (
    <select
      id={id}
      name={props.name ?? id}
      {...props}
      className={cn(CONTROL, "h-11 appearance-none pr-9", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5 6 6.5l5-5' stroke='%23526068' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.875rem center",
      }}
    >
      {children}
    </select>
  );
}

export function TextAreaBox({
  id,
  className,
  ...props
}: React.ComponentProps<"textarea"> & { id: string }) {
  return (
    <textarea
      id={id}
      name={props.name ?? id}
      rows={props.rows ?? 4}
      {...props}
      className={cn(CONTROL, "py-2.5 leading-relaxed", className)}
    />
  );
}
