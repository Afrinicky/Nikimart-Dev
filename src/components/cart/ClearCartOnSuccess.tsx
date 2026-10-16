"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/components/providers/CartProvider";

/**
 * Clears the cart once when the buyer lands on the orders page after a
 * confirmed order. Kept client-side because the cart lives in localStorage;
 * the server verify page can't touch it. Renders nothing.
 *
 * Once is enforced with a ref rather than left to the dependencies. Clearing
 * the cart changes the cart, and anything derived from the cart changing used
 * to re-run this effect, which cleared it again — a loop that kept the page
 * re-rendering and quietly cancelled every navigation started from it. Buyers
 * met it as buttons that did nothing on the one screen they reach by paying:
 * the order they had just placed, with Receipt and Track order both dead.
 *
 * The provider no longer hands out a new `clear` on every change, so the loop
 * cannot start from that end either. This guard stays because "do this once
 * on arrival" is what the component means, and saying so is better than
 * relying on a dependency list to imply it.
 */
export function ClearCartOnSuccess({ active }: { active: boolean }) {
  const { clear, ready } = useCart();
  const cleared = useRef(false);

  useEffect(() => {
    if (!active || !ready || cleared.current) return;
    cleared.current = true;
    clear();
  }, [active, ready, clear]);

  return null;
}
