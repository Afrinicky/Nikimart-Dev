"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCard, MapPin, Truck } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, inputClass } from "@/components/ui/Field";
import { useCart } from "@/components/providers/CartProvider";
import { formatPrice } from "@/lib/format";
import { placeOrder } from "@/lib/order-actions";

const DELIVERY_FEE = 20;

export function CheckoutClient({
  pickupPoints,
}: {
  pickupPoints: { id: string; name: string; locationName: string }[];
}) {
  const { items, subtotal, clear, ready } = useCart();
  const router = useRouter();

  const [method, setMethod] = useState<"delivery" | "pickup">("delivery");
  const [address, setAddress] = useState("");
  const [pickupPointId, setPickupPointId] = useState(pickupPoints[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const deliveryFee = method === "pickup" ? 0 : DELIVERY_FEE;
  const total = subtotal + deliveryFee;

  if (!ready) {
    return <div className="rounded-2xl bg-white p-10 text-center text-sm text-niki-ink/50 ring-1 ring-black/5">Loading…</div>;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<CreditCard className="h-6 w-6" />}
        title="Nothing to check out"
        message="Your cart is empty. Add some products first."
        actionLabel="Start shopping"
        actionHref="/products"
      />
    );
  }

  async function submit() {
    setError(null);
    if (method === "delivery" && !address.trim()) {
      setError("Please enter a delivery address.");
      return;
    }
    if (method === "pickup" && !pickupPointId) {
      setError("Please choose a pickup point.");
      return;
    }
    setPending(true);
    const res = await placeOrder({
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      deliveryMethod: method,
      address: method === "delivery" ? address.trim() : undefined,
      pickupPointId: method === "pickup" ? pickupPointId : undefined,
    });
    if (res.ok) {
      clear();
      router.push(`/orders?placed=${res.orderNumber}`);
    } else {
      setError(res.error);
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        {error ? (
          <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{error}</p>
        ) : null}

        <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
          <h2 className="font-display text-lg font-bold text-niki-ink">Delivery method</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMethod("delivery")}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${method === "delivery" ? "border-niki-orange bg-niki-orange/5" : "border-black/10 hover:bg-niki-surface"}`}
            >
              <Truck className="h-5 w-5 text-niki-orange" />
              <span>
                <span className="block text-sm font-semibold text-niki-ink">Delivery</span>
                <span className="block text-xs text-niki-ink/60">{formatPrice(DELIVERY_FEE)} fee</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMethod("pickup")}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${method === "pickup" ? "border-niki-orange bg-niki-orange/5" : "border-black/10 hover:bg-niki-surface"}`}
            >
              <MapPin className="h-5 w-5 text-niki-orange" />
              <span>
                <span className="block text-sm font-semibold text-niki-ink">Pickup</span>
                <span className="block text-xs text-niki-ink/60">Free</span>
              </span>
            </button>
          </div>

          <div className="mt-5">
            {method === "delivery" ? (
              <Field label="Delivery address" htmlFor="address">
                <textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  placeholder="Hall / hostel, room, area, city…"
                  className={inputClass}
                />
              </Field>
            ) : pickupPoints.length > 0 ? (
              <Field label="Pickup point" htmlFor="pickup">
                <select id="pickup" value={pickupPointId} onChange={(e) => setPickupPointId(e.target.value)} className={inputClass}>
                  {pickupPoints.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.locationName}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="text-sm text-niki-ink/60">No pickup points are available yet. Please choose delivery.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
          <h2 className="font-display text-lg font-bold text-niki-ink">Payment</h2>
          <p className="mt-2 text-sm text-niki-ink/60">
            Payment is simulated in this build — placing the order marks it as paid. Mobile Money and
            card options are coming next.
          </p>
        </div>
      </div>

      <aside className="h-fit rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">Order summary</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.productId} className="flex justify-between gap-2 text-niki-ink/70">
              <span className="line-clamp-1">
                {i.name} <span className="text-niki-ink/40">×{i.quantity}</span>
              </span>
              <span className="shrink-0 font-medium text-niki-ink">{formatPrice(i.price * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-black/5 pt-4 text-sm">
          <div className="flex justify-between text-niki-ink/70">
            <dt>Subtotal</dt>
            <dd className="font-medium text-niki-ink">{formatPrice(subtotal)}</dd>
          </div>
          <div className="flex justify-between text-niki-ink/70">
            <dt>Delivery</dt>
            <dd className="font-medium text-niki-ink">{deliveryFee === 0 ? "Free" : formatPrice(deliveryFee)}</dd>
          </div>
          <div className="flex justify-between border-t border-black/5 pt-2 text-base font-bold text-niki-ink">
            <dt>Total</dt>
            <dd className="font-display">{formatPrice(total)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-niki-orange px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Placing order…" : `Place order · ${formatPrice(total)}`}
        </button>
        <Link href="/cart" className="mt-3 block text-center text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Back to cart
        </Link>
      </aside>
    </div>
  );
}
