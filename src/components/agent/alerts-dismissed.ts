"use client";

/**
 * Which dashboard alerts this browser has been shown and waved away.
 *
 * localStorage rather than the account, for the same reason announcements use
 * it: an alert is a nudge, not a transaction, and a table of who-dismissed-what
 * would be a write on every dashboard load for something nobody will audit. A
 * second device shows the nudge again, which is the right way round.
 *
 * Dismissal is by key, and the keys are stable — an alert that comes back
 * because the thing it is about is still true will stay dismissed, which is the
 * point. Anything that must not be waved away is simply not dismissible.
 */

const STORAGE_KEY = "niki-agent-dismissed-alerts";
const KEEP = 50;

const listeners = new Set<() => void>();
let cache: { raw: string; keys: string[] } = { raw: "", keys: [] };

function read(): string[] {
  let raw = "";
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return EMPTY;
  }
  if (raw !== cache.raw) {
    let keys: string[] = [];
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) keys = parsed.filter((v): v is string => typeof v === "string");
    } catch {
      keys = [];
    }
    cache = { raw, keys };
  }
  return cache.keys;
}

export const dismissedAlerts = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: read,
  /** Server snapshot: nothing is dismissed until the browser says otherwise. */
  empty(): string[] {
    return EMPTY;
  },
  dismiss(key: string) {
    const next = Array.from(new Set([...read(), key])).slice(-KEEP);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: the alert returns next load, which is survivable.
    }
    cache = { raw: JSON.stringify(next), keys: next };
    listeners.forEach((l) => l());
  },
};

/** One frozen array, so the server snapshot is referentially stable. */
const EMPTY: string[] = [];
