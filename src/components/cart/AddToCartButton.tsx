"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { useCart, type CartItem } from "@/components/providers/CartProvider";

export function AddToCartButton({
  item,
  addLabel = "Add to cart",
}: {
  item: Omit<CartItem, "quantity">;
  addLabel?: string;
}) {
  const { addItem } = useCart();
  const router = useRouter();
  const [added, setAdded] = useState(false);

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => {
          addItem(item);
          setAdded(true);
          setTimeout(() => setAdded(false), 1600);
        }}
        className="flex items-center gap-2 rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-niki-orange/30 transition-colors hover:bg-niki-orange-light"
      >
        {added ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
        {added ? "Added to cart" : addLabel}
      </button>
      <button
        type="button"
        onClick={() => {
          addItem(item);
          router.push("/checkout");
        }}
        className="flex items-center gap-2 rounded-full bg-niki-navy px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-navy-light"
      >
        Buy now
      </button>
    </div>
  );
}
