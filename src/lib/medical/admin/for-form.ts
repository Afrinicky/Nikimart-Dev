/**
 * A database row, flattened for a client component.
 *
 * Prisma returns `Decimal(14,2)` columns as Decimal instances and a Decimal
 * cannot cross from a server component into a client one: React refuses to
 * serialise it, warns once for every field, and what arrives in the browser is
 * an object no form control can read. Dates are serialisable but a date input
 * wants `YYYY-MM-DD`, not an ISO timestamp.
 *
 * So every scalar becomes a string, number or boolean, and relations are left
 * behind — a form that needed a joined row would be asking for the wrong
 * thing, and dropping them keeps a nested supplier cost out of a bundle that
 * ships to a browser.
 *
 * Lives here rather than beside the forms because it is called from server
 * components: anything exported from a `"use client"` module is a client
 * function, and a server component calling one fails at render.
 */
export type FormRow = Record<string, string | number | boolean | null>;

export function forForm(row: Record<string, unknown>): FormRow {
  const out: FormRow = {};

  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = null;
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (value instanceof Date) {
      // The form of a date an <input type="date"> accepts, and the only part
      // of a timestamp a form ever edits.
      out[key] = value.toISOString().slice(0, 10);
    } else if (isDecimalLike(value)) {
      out[key] = value.toString();
    }
    // Anything else — an array, a joined row — is deliberately dropped.
  }

  return out;
}

/**
 * A Prisma Decimal, identified by shape rather than by `instanceof`.
 *
 * There are three generated clients in this repository and each has its own
 * Decimal class, so an `instanceof` check against one of them silently fails
 * for the others.
 */
function isDecimalLike(value: unknown): value is { toString(): string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toFixed" in value &&
    typeof (value as { toFixed: unknown }).toFixed === "function"
  );
}
