/**
 * Reading a failed database write.
 *
 * A write can fail for a reason the person at the keyboard can act on — this
 * seller already runs a shop, that slug is taken, the pickup point you chose
 * has since been removed — and the only place that reason exists is the
 * driver's error. Thrown as-is it reaches the browser as a stack trace and a
 * blank page; swallowed, it becomes "please try again" and the same click
 * fails forever.
 *
 * So a form action needs the constraint by name, and Prisma reports it three
 * different ways depending on the database and the constraint: a list of
 * columns, a bare index name, or an index name with a parenthesised note after
 * it. This normalises all three into the column names involved, with no Prisma
 * import, which keeps it a pure function and testable.
 */

export interface DbFailure {
  /** The driver's error code — "P2002", "P2003" — or "" if not one of them. */
  code: string;
  /** Column names the failing constraint covers, lowercased. */
  fields: string[];
}

/** Known codes, named so call sites read as intent rather than numbers. */
export const DB_UNIQUE_VIOLATION = "P2002";
export const DB_FOREIGN_KEY_VIOLATION = "P2003";
export const DB_RECORD_NOT_FOUND = "P2025";

const INDEX_SUFFIXES = ["_key", "_unique", "_pkey", "_fkey", "_idx"];

/**
 * Pull the column names out of one entry of Prisma's `meta`.
 *
 * An entry is either a column ("ownerId") or an index name
 * ("Vendor_ownerId_key", sometimes followed by "(index)"). An index name is
 * <table>_<column>…_<suffix>, so dropping the first and last segments leaves
 * the columns — and a name that does not follow the convention is returned
 * whole rather than mangled into nothing.
 */
function columnsFrom(entry: string): string[] {
  const name = entry.replace(/\s*\(.*\)\s*$/, "").trim();
  if (!name) return [];

  const suffix = INDEX_SUFFIXES.find((s) => name.toLowerCase().endsWith(s));
  if (!suffix) return [name.toLowerCase()];

  const parts = name.slice(0, -suffix.length).split("_");
  // <table>_<column> at least, or there is nothing to strip.
  if (parts.length < 2) return [name.toLowerCase()];
  return parts.slice(1).map((p) => p.toLowerCase()).filter(Boolean);
}

/** What went wrong, as codes and column names. */
export function describeDbError(error: unknown): DbFailure {
  if (!error || typeof error !== "object") return { code: "", fields: [] };

  const code = typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "";
  const meta = (error as { meta?: unknown }).meta;
  const raw: unknown[] = [];

  if (meta && typeof meta === "object") {
    const target = (meta as { target?: unknown }).target;
    if (Array.isArray(target)) raw.push(...target);
    else if (typeof target === "string") raw.push(target);

    const field = (meta as { field_name?: unknown }).field_name;
    if (typeof field === "string") raw.push(field);
  }

  const fields: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    for (const column of columnsFrom(entry)) {
      if (!fields.includes(column)) fields.push(column);
    }
  }

  return { code, fields };
}

/** Did this failure name that column? Case-insensitive, as the metadata is. */
export function failedOn(failure: DbFailure, column: string): boolean {
  return failure.fields.includes(column.toLowerCase());
}
