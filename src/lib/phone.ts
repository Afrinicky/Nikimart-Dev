// Pure phone helpers (no server-only deps) — usable in auth, actions, and UI.

/** True if the string looks like an email address. */
export function looksLikeEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}

/** Digits only, or "" if none. */
export function phoneDigits(phone?: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

/**
 * Normalise a Ghana phone number to 233XXXXXXXXX, or null if it can't be one.
 * Accepts 0XXXXXXXXX, +233XXXXXXXXX, 233XXXXXXXXX, spaced variants, etc.
 */
export function normalizeGhPhone(phone?: string | null): string | null {
  let d = phoneDigits(phone);
  if (d.startsWith("233")) {
    // already international
  } else if (d.startsWith("0")) {
    d = "233" + d.slice(1);
  } else if (d.length === 9) {
    d = "233" + d;
  }
  return d.length === 12 && d.startsWith("233") ? d : null;
}

/** The last 9 significant digits (subscriber number), for format-agnostic matching. */
export function phoneLast9(phone?: string | null): string | null {
  const d = phoneDigits(phone);
  return d.length >= 9 ? d.slice(-9) : null;
}
