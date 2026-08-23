"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { BusyButton } from "@/components/ui/motion";
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
  // Checkout is a server-rendered route, so the tap needs to say something
  // while it loads rather than sitting there looking ignored.
  const [going, setGoing] = useState(false);

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => {
          addItem(item);
          setAdded(true);
          setTimeout(() => setAdded(false), 1600);
        }}
        className="niki-press niki-focus flex items-center gap-2 rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-niki-orange/30 hover:bg-niki-orange-light"
      >
        {added ? (
          <Check className="animate-scale-in h-4 w-4" />
        ) : (
          <ShoppingCart className="h-4 w-4" />
        )}
        {added ? "Added to cart" : addLabel}
      </button>
      <BusyButton
        type="button"
        busy={going}
        pendingLabel="Opening checkout…"
        onClick={() => {
          addItem(item);
          setGoing(true);
          router.push("/checkout");
        }}
        className="rounded-full bg-niki-navy px-6 py-3 text-sm font-semibold text-white hover:bg-niki-navy-light"
      >
        Buy now
      </BusyButton>
    </div>
  );
}
