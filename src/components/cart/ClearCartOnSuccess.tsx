"use client";

import { useEffect } from "react";
import { useCart } from "@/components/providers/CartProvider";

/**
 * Clears the cart once when the buyer lands on the orders page after a
 * confirmed order. Kept client-side because the cart lives in localStorage;
 * the server verify page can't touch it. Renders nothing.
 */
export function ClearCartOnSuccess({ active }: { active: boolean }) {
  const { clear, ready } = useCart();
  useEffect(() => {
    if (active && ready) clear();
  }, [active, ready, clear]);
  return null;
}
