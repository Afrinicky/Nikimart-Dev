"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";

export function CartBadge() {
  const { count, ready } = useCart();
  return (
    <Link
      href="/cart"
      className="relative flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      aria-label="Cart"
    >
      <span className="relative">
        <ShoppingCart className="h-5 w-5" />
        {ready && count > 0 ? (
          <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-niki-orange px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
      <span className="hidden text-[10px] font-medium sm:block">Cart</span>
    </Link>
  );
}
