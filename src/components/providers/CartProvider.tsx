"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  price: number;
  emoji: string;
  gradientFrom: string;
  gradientTo: string;
  image?: string;
  vendorId: string;
  /** Billable shipping weight in kg (for the delivery-fee engine). */
  weightKg?: number;
  /** Parcel volume in cm³ (L×W×H) for size-based delivery pricing. */
  volumeCm3?: number;
  /**
   * The seller's minimum order quantity. Held on the line so the cart can hold
   * a buyer to it without asking the server on every tap; the server enforces
   * it again when the order is placed, because this arrived from a browser.
   */
  moq?: number;
  quantity: number;
}

/** A listing's minimum, sanitised. Anything under one unit is one unit. */
function minimumFor(item: { moq?: number }): number {
  const n = Math.round(Number(item.moq ?? 1));
  return Number.isFinite(n) && n > 1 ? n : 1;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  ready: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "nikimart:cart:v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage once on mount. localStorage is unavailable during
  // SSR, so this must run in an effect (not a lazy initializer).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      // ignore malformed storage
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Persist on change (after hydration).
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage full / unavailable — non-fatal
    }
  }, [items, ready]);

  /**
   * The actions, each stable for the life of the provider.
   *
   * They used to be rebuilt inside the same `useMemo` as the totals, so every
   * change to the cart handed out new function identities. Anything with one
   * of them in an effect's dependencies then re-ran that effect on every
   * change — and an effect that writes to the cart re-triggered itself, which
   * is a render loop that leaves the page alive but unable to finish a
   * navigation. Functional updates are what make this possible: none of them
   * needs to close over the current items.
   */
  const addItem = useCallback<CartContextValue["addItem"]>((item, quantity) => {
    // The first add is a whole minimum order, not one unit of it. A carton
    // of twelve added as a single bottle would be silently corrected at
    // checkout, which is the moment a buyer least wants to be surprised.
    const min = minimumFor(item);
    const amount = Math.max(1, Math.round(quantity ?? min));
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === item.productId
            ? { ...i, moq: item.moq ?? i.moq, quantity: i.quantity + amount }
            : i,
        );
      }
      return [...prev, { ...item, quantity: Math.max(amount, min) }];
    });
  }, []);

  const updateQuantity = useCallback<CartContextValue["updateQuantity"]>((productId, quantity) => {
    setItems((prev) =>
      prev.flatMap((i) => {
        if (i.productId !== productId) return [i];
        const min = minimumFor(i);
        // Stepping below the minimum removes the line rather than parking
        // it at a quantity the seller will not accept. Wanting fewer than
        // the minimum means not wanting it.
        if (quantity < min) return [];
        return [{ ...i, quantity }];
      }),
    );
  }, []);

  const removeItem = useCallback<CartContextValue["removeItem"]>((productId) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  // Returning `prev` when there is nothing to clear lets React bail out
  // instead of re-rendering everything for a second empty array.
  const clear = useCallback<CartContextValue["clear"]>(() => {
    setItems((prev) => (prev.length === 0 ? prev : []));
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return {
      items,
      count,
      subtotal,
      ready,
      addItem,
      updateQuantity,
      removeItem,
      clear,
    };
  }, [items, ready, addItem, updateQuantity, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
