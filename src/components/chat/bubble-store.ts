"use client";

import type { BubbleOffset } from "@/lib/chat/bubble-position";

/**
 * The viewport, and where each bubble has been dragged to.
 *
 * External stores rather than state set from a mount effect, the way the rest
 * of this codebase reads the browser: measuring in an effect means a first
 * render with the wrong answer and a second one to correct it, and the bubble
 * visibly jumps from one corner to another while that happens.
 */

export interface Viewport {
  width: number;
  height: number;
}

/** A desktop-ish guess for the server, where there is no window to measure. */
const SERVER_VIEWPORT: Viewport = Object.freeze({ width: 1024, height: 768 });

const viewportListeners = new Set<() => void>();
let viewportCache: Viewport = SERVER_VIEWPORT;
let listening = false;

function measure(): Viewport {
  const width = window.innerWidth;
  const height = window.innerHeight;
  // Same object unless it really changed: useSyncExternalStore compares by
  // identity, and a fresh object every read is an infinite render loop.
  if (width !== viewportCache.width || height !== viewportCache.height) {
    viewportCache = { width, height };
  }
  return viewportCache;
}

export const viewport = {
  subscribe(listener: () => void) {
    viewportListeners.add(listener);
    if (!listening) {
      listening = true;
      window.addEventListener("resize", () => {
        measure();
        viewportListeners.forEach((l) => l());
      });
    }
    return () => {
      viewportListeners.delete(listener);
    };
  },
  get: measure,
  server(): Viewport {
    return SERVER_VIEWPORT;
  },
};

/**
 * Where one bubble sits.
 *
 * Null until somebody has moved it, which is what lets the component fall back
 * to the default for the screen it is actually on rather than a stored
 * position from a different one.
 */
export interface OffsetStore {
  subscribe(listener: () => void): () => void;
  get(): BubbleOffset | null;
  server(): BubbleOffset | null;
  /** Move it now, without writing to storage — for every frame of a drag. */
  move(next: BubbleOffset): void;
  /** Keep it there, once the drag ends. */
  persist(next: BubbleOffset): void;
}

const stores = new Map<string, OffsetStore>();

export function offsetStore(key: string): OffsetStore {
  const existing = stores.get(key);
  if (existing) return existing;

  const listeners = new Set<() => void>();
  let loaded = false;
  let current: BubbleOffset | null = null;

  function read(): BubbleOffset | null {
    if (loaded) return current;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as Partial<BubbleOffset>) : null;
      current =
        typeof parsed?.right === "number" && typeof parsed.bottom === "number"
          ? { right: parsed.right, bottom: parsed.bottom }
          : null;
    } catch {
      current = null;
    }
    return current;
  }

  function announce(next: BubbleOffset) {
    current = next;
    loaded = true;
    listeners.forEach((l) => l());
  }

  const store: OffsetStore = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: read,
    server: () => null,
    move: announce,
    persist(next) {
      announce(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage blocked: it stays put for this page view.
      }
    },
  };

  stores.set(key, store);
  return store;
}
