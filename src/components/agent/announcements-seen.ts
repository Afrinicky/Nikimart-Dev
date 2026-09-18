"use client";

/**
 * Which announcements this browser has already been shown.
 *
 * Kept in localStorage rather than on the account: an announcement is a notice,
 * not a transaction, and a table of who-saw-what would be a write on every
 * login for something nobody will ever audit. The cost is that a second device
 * shows the notice again, which is the right way round — better seen twice than
 * missed.
 *
 * An external store rather than component state because two places read it at
 * once: the pop-up that shows unseen notices, and the bell that counts them.
 */

const STORAGE_KEY = "niki-agent-seen-announcements";
/** Enough that a year of notices fits, small enough to stay a tidy key. */
const KEEP = 100;

const listeners = new Set<() => void>();
/** Cached snapshot: useSyncExternalStore requires a stable value between reads. */
let cache: { raw: string; ids: string[] } = { raw: "", ids: [] };

function read(): string[] {
  let raw = "";
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return [];
  }
  if (raw !== cache.raw) {
    let ids: string[] = [];
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === "string");
    } catch {
      ids = [];
    }
    cache = { raw, ids };
  }
  return cache.ids;
}

export const seenAnnouncements = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: read,
  /** Server snapshot: nothing is seen until the browser says otherwise. */
  empty(): string[] {
    return EMPTY;
  },
  markSeen(...ids: string[]) {
    const next = Array.from(new Set([...read(), ...ids])).slice(-KEEP);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: the notice shows again next time, which is survivable.
    }
    cache = { raw: JSON.stringify(next), ids: next };
    listeners.forEach((l) => l());
  },
};

/** One frozen array, so the server snapshot is referentially stable. */
const EMPTY: string[] = [];
