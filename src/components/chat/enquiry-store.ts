"use client";

/**
 * The visitor's claim on their own enquiry.
 *
 * A person on a public page has no account, so the only thing tying them to
 * the conversation they opened is a random token kept by their browser. It
 * lives in localStorage rather than a cookie because it is the browser's
 * business rather than the server's, and because a cookie sent on every
 * request for a chat nobody opened is a cost for nothing.
 *
 * An external store rather than component state, the way the announcement
 * seen-list is: the launcher reads it on mount and again after an enquiry is
 * opened, and reading storage during render is a hydration mismatch waiting to
 * happen.
 *
 * Losing it means the next enquiry starts a new thread, which is survivable.
 */

const KEY = "niki-enquiry";

export interface EnquiryClaim {
  conversationId: string;
  visitorToken: string;
  name: string;
}

const listeners = new Set<() => void>();
/** Cached snapshot: useSyncExternalStore needs a stable value between reads. */
let cache: { raw: string; claim: EnquiryClaim | null } = { raw: "", claim: null };

function read(): EnquiryClaim | null {
  let raw = "";
  try {
    raw = window.localStorage.getItem(KEY) ?? "";
  } catch {
    return null;
  }
  if (raw !== cache.raw) {
    let claim: EnquiryClaim | null = null;
    try {
      const parsed = (raw ? JSON.parse(raw) : null) as Partial<EnquiryClaim> | null;
      if (parsed?.conversationId && parsed.visitorToken) {
        claim = {
          conversationId: parsed.conversationId,
          visitorToken: parsed.visitorToken,
          name: parsed.name ?? "",
        };
      }
    } catch {
      claim = null;
    }
    cache = { raw, claim };
  }
  return cache.claim;
}

function announce(raw: string, claim: EnquiryClaim | null) {
  cache = { raw, claim };
  listeners.forEach((l) => l());
}

export const enquiryClaim = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: read,
  /** Nothing is claimed until the browser says otherwise. */
  server(): EnquiryClaim | null {
    return null;
  },
  save(claim: EnquiryClaim) {
    const raw = JSON.stringify(claim);
    try {
      window.localStorage.setItem(KEY, raw);
    } catch {
      // Storage blocked: the chat still works for this page view.
    }
    announce(raw, claim);
  },
  clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // Nothing to do.
    }
    announce("", null);
  },
};
