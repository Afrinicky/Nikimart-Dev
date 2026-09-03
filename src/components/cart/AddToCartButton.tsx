"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { BusyButton } from "@/components/ui/motion";
import { useCart, type CartItem } from "@/components/providers/CartProvider";

/**
 * Adding to the cart, with the seller's minimum built in.
 *
 * A listing sold by the carton starts at a carton. The stepper will not go
 * below it and says why, so the minimum is something a buyer meets on the
 * product page — where they can still change their mind — rather than at
 * checkout, where being told the order is invalid is just an obstacle.
 */
export function AddToCartButton({
  item,
  addLabel = "Add to cart",
  moq = 1,
}: {
  item: Omit<CartItem, "quantity">;
  addLabel?: string;
  /** The seller's minimum order quantity. */
  moq?: number;
}) {
  const { addItem } = useCart();
  const router = useRouter();
  const min = Number.isFinite(moq) && moq > 1 ? Math.round(moq) : 1;
  const [quantity, setQuantity] = useState(min);
  const [added, setAdded] = useState(false);
  // Checkout is a server-rendered route, so the tap needs to say something
  // while it loads rather than sitting there looking ignored.
  const [going, setGoing] = useState(false);

  const step = (by: number) => setQuantity((q) => Math.max(min, q + by));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-niki-surface p-1 ring-1 ring-niki-edge">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={quantity <= min}
            aria-label="Decrease quantity"
            className="niki-focus flex h-8 w-8 items-center justify-center rounded-full text-niki-ink/70 transition-colors hover:bg-white disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center font-figures text-sm font-semibold text-niki-ink">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Increase quantity"
            className="niki-focus flex h-8 w-8 items-center justify-center rounded-full text-niki-ink/70 transition-colors hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {min > 1 ? (
          <p className="text-xs font-medium text-niki-ink/60">
            Sold in minimums of <span className="font-figures text-niki-ink">{min}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            addItem({ ...item, moq: min }, quantity);
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
            addItem({ ...item, moq: min }, quantity);
            setGoing(true);
            router.push("/checkout");
          }}
          className="rounded-full bg-niki-black px-6 py-3 text-sm font-semibold text-white hover:bg-niki-black-soft"
        >
          Buy now
        </BusyButton>
      </div>
    </div>
  );
}
