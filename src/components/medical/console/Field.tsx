import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The console's form controls.
 *
 * One vocabulary, so a date on a purchase order looks and behaves exactly like
 * a date on a tender. Every control carries a real `<label>` tied to it by id
 * rather than a floating placeholder: a placeholder disappears the moment
 * somebody types, which on a twenty-field procurement form means they can no
 * longer tell which box they are in.
 */

const CONTROL =
  "medi-focus w-full rounded-lg bg-white px-3 text-[0.8125rem] text-medi-ink " +
  "shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] placeholder:text-medi-muted " +
  "disabled:bg-medi-surface disabled:text-medi-muted";

export function Field({
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
        <p className="medi-meta mt-1 text-medi-danger">{error}</p>
      ) : hint ? (
        <p className="medi-meta mt-1 text-medi-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  id,
  className,
  ...props
}: React.ComponentProps<"input"> & { id: string }) {
  return <input id={id} name={props.name ?? id} {...props} className={cn(CONTROL, "h-9", className)} />;
}

/** Money and quantities. Tabular figures, right-aligned, no spinner buttons. */
export function NumberInput({
  id,
  className,
  ...props
}: React.ComponentProps<"input"> & { id: string }) {
  return (
    <input
      id={id}
      name={props.name ?? id}
      inputMode="decimal"
      {...props}
      className={cn(
        CONTROL,
        "font-figures h-9 text-right [appearance:textfield]",
        "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
    />
  );
}

export function Select({
  id,
  className,
  children,
  ...props
}: React.ComponentProps<"select"> & { id: string }) {
  return (
    <select id={id} name={props.name ?? id} {...props} className={cn(CONTROL, "h-9 pr-8", className)}>
      {children}
    </select>
  );
}

export function TextArea({
  id,
  className,
  ...props
}: React.ComponentProps<"textarea"> & { id: string }) {
  return (
    <textarea
      id={id}
      name={props.name ?? id}
      rows={props.rows ?? 3}
      {...props}
      className={cn(CONTROL, "py-2 leading-relaxed", className)}
    />
  );
}

/** A group of fields under a heading, inside a panel. */
export function FieldSet({
  legend,
  description,
  columns = 2,
  children,
}: {
  legend: string;
  description?: string;
  columns?: 1 | 2 | 3;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="medi-h3 mb-1 text-[1rem]">{legend}</legend>
      {description ? <p className="medi-meta mb-3 text-medi-muted">{description}</p> : null}
      <div
        className={cn(
          "mt-3 grid gap-4",
          columns === 1 && "grid-cols-1",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {children}
      </div>
    </fieldset>
  );
}
