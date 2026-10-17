import { looksLikeEmail, normalizeGhPhone } from "./phone.ts";

/**
 * The two pure decisions the contact book rests on.
 *
 * Split out of lib/messenger.ts, which is server-only, so these can be tested
 * directly — both are the kind of rule whose bugs only appear at scale, and
 * neither touches a database or a secret.
 */

/** Tags are stored as one comma-separated string; a group is just a tag. */
export function splitTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function joinTags(tags: string[]): string {
  return splitTags(tags.join(",")).join(", ");
}

/**
 * The one value that decides whether two rows are the same person.
 *
 * The phone first, because that is what a message goes to and what people
 * actually have here; the email only when there is no phone. Re-importing last
 * month's spreadsheet is the normal case, not the exception, and it has to
 * update the eleven rows that moved rather than add four hundred duplicates.
 *
 * Null means "not a person we can reach", which the importer reports rather
 * than quietly dropping.
 */
export function dedupeKeyFor(phone: string, email: string): string | null {
  const normalised = normalizeGhPhone(phone);
  if (normalised) return `p:${normalised}`;
  // A number this doesn't recognise as Ghanaian is still a number — an
  // international supplier should not be refused a place in the book.
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 7) return `p:${digits}`;
  const addr = email.trim().toLowerCase();
  if (addr && looksLikeEmail(addr)) return `e:${addr}`;
  return null;
}
