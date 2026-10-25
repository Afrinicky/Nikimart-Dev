"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

/**
 * The cart and the quotation list, in one store.
 *
 * They are one store because a buyer builds both at once. A laboratory's order
 * is four consumables they can buy today and one analyser they need a price
 * for, and making those two separate mental objects — two icons, two pages,
 * two "you have items waiting" states — is how a customer leaves with neither.
 * One basket, two lists inside it, two counts in the header.
 *
 * Why the browser holds it
 * ------------------------
 * A basket that needs an account is a basket a first-time visitor abandons,
 * and the whole point of the quotation flow is that somebody can ask for a
 * price before they have decided to be a customer. So it lives in
 * localStorage, survives a reload, and is attached to a person only when they
 * sign in or submit.
 *
 * Why it is not useState + useEffect
 * ----------------------------------
 * localStorage is invisible to the server, so the obvious shape — empty state,
 * then read it in an effect — renders "0" in the header and flips to "3" once
 * the browser catches up. That is a cascading render on every page load and it
 * reads as a glitch in the first second of the site.
 *
 * `useSyncExternalStore` is the shape React has for exactly this: one snapshot
 * for the server, another for the browser, and no render cascade between them.
 * It is also what `AdminShell` already uses for the retail sidebar, for the
 * same reason — so this is the house pattern rather than a new one.
 *
 * Nothing here is trusted. These are product ids and quantities; the price,
 * the stock, whether the product may be bought at all and whether it still
 * exists are all resolved on the server when the quotation is submitted or the
 * order is placed. A basket that priced itself in the browser would be a
 * basket a customer could edit.
 */

export type BasketList = "cart" | "quote";

export interface BasketLine {
  productId: string;
  slug: string;
  name: string;
  /**
   * The listed price in pesewas at the moment it was added. Display only — the
   * server reprices everything before anything is owed.
   */
  price: number;
  unitOfSale: string;
  packSize: string;
  image: string | null;
  quantity: number;
  minimumOrderQuantity: number;
  addedAt: number;
}

interface BasketState {
  cart: BasketLine[];
  quote: BasketLine[];
  /**
   * True once the stored basket has been read. Part of the snapshot rather
   * than separate state, so a consumer can never see lines without knowing
   * whether they are the real ones.
   */
  ready: boolean;
}

interface BasketApi extends BasketState {
  add: (list: BasketList, line: Omit<BasketLine, "quantity" | "addedAt">, quantity?: number) => void;
  setQuantity: (list: BasketList, productId: string, quantity: number) => void;
  remove: (list: BasketList, productId: string) => void;
  clear: (list: BasketList) => void;
  /** Move a line from the cart to the quotation list, or back. */
  moveTo: (from: BasketList, productId: string) => void;
  has: (list: BasketList, productId: string) => boolean;
  count: (list: BasketList) => number;
}

const STORAGE_KEY = "medi-basket";
/**
 * Bumped when the stored shape changes, so an old basket is dropped rather
 * than read into fields that no longer mean the same thing.
 */
const STORAGE_VERSION = 1;

/** The server's snapshot, and the one before the browser has read storage. */
const EMPTY: BasketState = { cart: [], quote: [], ready: false };

// ---------------------------------------------------------------------------
// The store, outside React
// ---------------------------------------------------------------------------

const store = {
  state: EMPTY,
  listeners: new Set<() => void>(),

  subscribe(listener: () => void): () => void {
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  },

  /**
   * The browser snapshot. Reads storage once, then returns the same object
   * until something changes it — `useSyncExternalStore` compares by identity
   * and would loop forever on a fresh object each call.
   */
  getSnapshot(): BasketState {
    if (!store.state.ready) {
      store.state = { ...readStored(), ready: true };
    }
    return store.state;
  },

  /**
   * The server snapshot, and the one React hydrates against. Always empty:
   * the server cannot see storage, and claiming otherwise is the hydration
   * mismatch this whole arrangement exists to avoid.
   */
  getServerSnapshot(): BasketState {
    return EMPTY;
  },

  set(next: BasketState) {
    store.state = next;
    persist(next);
    for (const listener of store.listeners) listener();
  },
};

if (typeof window !== "undefined") {
  // A basket open in two tabs should not silently diverge; whichever tab wrote
  // last is the truth, and the other catches up rather than overwriting it on
  // its next change.
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    store.state = { ...readStored(), ready: true };
    for (const listener of store.listeners) listener();
  });
}

function persist(state: BasketState) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, cart: state.cart, quote: state.quote }),
    );
  } catch {
    // Private browsing, a full quota, or storage blocked outright. The basket
    // still works for this page view; it just will not survive a reload, which
    // is better than an exception on every change.
  }
}

// ---------------------------------------------------------------------------
// React
// ---------------------------------------------------------------------------

const BasketContext = createContext<BasketApi | null>(null);

export function BasketProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  const add = useCallback<BasketApi["add"]>((list, line, quantity) => {
    const current = store.getSnapshot();
    const lines = current[list];
    const existing = lines.find((l) => l.productId === line.productId);
    const step = Math.max(1, quantity ?? line.minimumOrderQuantity ?? 1);

    store.set({
      ...current,
      [list]: existing
        ? lines.map((l) =>
            l.productId === line.productId ? { ...l, quantity: l.quantity + step } : l,
          )
        : // Newest first. A buyer who has just added something expects to see
          // it at the top of the list, not at the bottom of twelve lines.
          [{ ...line, quantity: step, addedAt: Date.now() }, ...lines],
    });
  }, []);

  const setQuantity = useCallback<BasketApi["setQuantity"]>((list, productId, quantity) => {
    const current = store.getSnapshot();
    store.set({
      ...current,
      [list]: current[list].flatMap((line) => {
        if (line.productId !== productId) return [line];
        // Typing the quantity down to nothing is how people remove a line.
        // Honouring it beats leaving a zero-quantity row nobody can get rid of.
        const next = Math.floor(quantity);
        if (next <= 0) return [];
        return [{ ...line, quantity: Math.max(line.minimumOrderQuantity || 1, next) }];
      }),
    });
  }, []);

  const remove = useCallback<BasketApi["remove"]>((list, productId) => {
    const current = store.getSnapshot();
    store.set({
      ...current,
      [list]: current[list].filter((line) => line.productId !== productId),
    });
  }, []);

  const clear = useCallback<BasketApi["clear"]>((list) => {
    store.set({ ...store.getSnapshot(), [list]: [] });
  }, []);

  const moveTo = useCallback<BasketApi["moveTo"]>((from, productId) => {
    const to: BasketList = from === "cart" ? "quote" : "cart";
    const current = store.getSnapshot();
    const line = current[from].find((l) => l.productId === productId);
    if (!line) return;
    const alreadyThere = current[to].find((l) => l.productId === productId);

    store.set({
      ...current,
      [from]: current[from].filter((l) => l.productId !== productId),
      [to]: alreadyThere
        ? current[to].map((l) =>
            l.productId === productId ? { ...l, quantity: l.quantity + line.quantity } : l,
          )
        : [{ ...line, addedAt: Date.now() }, ...current[to]],
    });
  }, []);

  const api = useMemo<BasketApi>(
    () => ({
      ...state,
      add,
      setQuantity,
      remove,
      clear,
      moveTo,
      has: (list, productId) => state[list].some((line) => line.productId === productId),
      // Lines, not units. "3" next to a cart means three different things to
      // collect; a buyer who ordered 500 gloves does not want to see "500".
      count: (list) => state[list].length,
    }),
    [state, add, setQuantity, remove, clear, moveTo],
  );

  return <BasketContext.Provider value={api}>{children}</BasketContext.Provider>;
}

export function useBasket(): BasketApi {
  const context = useContext(BasketContext);
  if (!context) {
    throw new Error("useBasket must be used inside a BasketProvider.");
  }
  return context;
}

function readStored(): BasketState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as { version?: number; cart?: unknown; quote?: unknown };
    if (parsed.version !== STORAGE_VERSION) return EMPTY;
    return { cart: sanitise(parsed.cart), quote: sanitise(parsed.quote), ready: false };
  } catch {
    return EMPTY;
  }
}

/**
 * Anything in localStorage is user-editable, so the stored basket is treated
 * as input rather than as state: every line is checked for the fields the UI
 * reads, and anything else is dropped. The cost of not doing this is a crash
 * on the header of every page for anyone whose storage got corrupted once.
 */
function sanitise(lines: unknown): BasketLine[] {
  if (!Array.isArray(lines)) return [];
  return lines.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const line = entry as Record<string, unknown>;
    if (typeof line.productId !== "string" || !line.productId) return [];
    if (typeof line.slug !== "string" || typeof line.name !== "string") return [];
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return [];
    return [
      {
        productId: line.productId,
        slug: line.slug,
        name: line.name,
        price: Number.isFinite(Number(line.price)) ? Number(line.price) : 0,
        unitOfSale: typeof line.unitOfSale === "string" ? line.unitOfSale : "unit",
        packSize: typeof line.packSize === "string" ? line.packSize : "",
        image: typeof line.image === "string" ? line.image : null,
        quantity: Math.floor(quantity),
        minimumOrderQuantity: Math.max(1, Number(line.minimumOrderQuantity) || 1),
        addedAt: Number(line.addedAt) || Date.now(),
      },
    ];
  });
}
