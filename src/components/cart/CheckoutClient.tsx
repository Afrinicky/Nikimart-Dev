"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CreditCard, MapPin, Package, Plane } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCart } from "@/components/providers/CartProvider";
import { formatPrice } from "@/lib/format";
import { placeOrder } from "@/lib/order-actions";
import { quoteCartShipping, type CartShippingQuote } from "@/lib/shipping-actions";

export function CheckoutClient({
  defaultPickupId = "",
  paymentEnabled = false,
}: {
  defaultPickupId?: string;
  paymentEnabled?: boolean;
}) {
  const { items, subtotal, clear, ready } = useCart();
  const router = useRouter();

  const [quote, setQuote] = useState<CartShippingQuote | null>(null);
  // Which cart contents the current quote was fetched for. Anything else means
  // a fetch is still in flight — derived rather than a second state flag.
  const [quotedFor, setQuotedFor] = useState<string | null>(null);
  const [pickupPointId, setPickupPointId] = useState(defaultPickupId);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A stable key so the quote refetches only when the actual cart contents change.
  const itemsKey = useMemo(
    () => items.map((i) => `${i.productId}:${i.quantity}`).join("|"),
    [items],
  );

  useEffect(() => {
    // Nothing to quote for an empty cart, and nothing reads the quote either —
    // the empty-cart state renders before any of it is used.
    if (!ready || items.length === 0) return;
    let cancelled = false;
    quoteCartShipping({ items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) })
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        setQuotedFor(itemsKey);
        setPickupPointId((prev) =>
          prev && q.points.some((p) => p.id === prev) ? prev : (q.points[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setQuote({ points: [], totalCbm: 0, hasAbroad: false });
        setQuotedFor(itemsKey);
      });
    return () => {
      cancelled = true;
    };
    // itemsKey captures the meaningful cart state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, ready]);

  const loadingQuote = quotedFor !== itemsKey;
  const points = quote?.points ?? [];
  const selected = points.find((p) => p.id === pickupPointId);
  const shippingFee = selected?.fee ?? 0;
  const total = subtotal + shippingFee;

  if (!ready) {
    return <div className="rounded-2xl bg-white p-10 text-center text-sm text-niki-ink/50 ring-1 ring-niki-edge">Loading…</div>;
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
    if (!pickupPointId) {
      setError("Please choose a pickup point.");
      return;
    }
    setPending(true);
    const res = await placeOrder({
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      pickupPointId,
    });
    if (res.ok) {
      if (res.authorizationUrl) {
        // Real payment: hand off to Paystack. The cart is cleared on the orders
        // page once payment is confirmed, so it survives a cancelled payment.
        window.location.href = res.authorizationUrl;
        return;
      }
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

        <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-niki-orange" />
            <h2 className="font-display text-lg font-bold text-niki-ink">Choose a pickup point</h2>
          </div>
          <p className="mt-1 text-sm text-niki-ink/60">
            Collect your order at any Nickimart station. The shipping fee depends on the distance from the
            seller and the size (CBM) of your items.
          </p>

          {quote?.hasAbroad ? (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-niki-black/5 px-3 py-2 text-xs font-medium text-niki-ink/70">
              <Plane className="h-4 w-4 text-niki-orange" /> Some items ship from abroad — the fee includes
              international freight.
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            {loadingQuote ? (
              <div className="rounded-xl bg-niki-surface p-6 text-center text-sm text-niki-ink/50">
                Calculating shipping…
              </div>
            ) : points.length === 0 ? (
              <p className="rounded-xl bg-niki-surface p-4 text-sm text-niki-ink/60">
                No pickup points are available yet. Please check back soon.
              </p>
            ) : (
              points.map((p) => {
                const active = p.id === pickupPointId;
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4 transition-colors ${
                      active ? "border-niki-orange bg-niki-orange/5" : "border-niki-edge-strong hover:bg-niki-surface"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="pickupPoint"
                        value={p.id}
                        checked={active}
                        onChange={() => setPickupPointId(p.id)}
                        className="h-4 w-4 text-niki-orange focus:ring-niki-orange"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-niki-ink">{p.name}</span>
                        <span className="block text-xs text-niki-ink/60">{p.locationName}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-niki-ink">
                      {p.fee === 0 ? <span className="text-niki-success">Free</span> : formatPrice(p.fee)}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <h2 className="font-display text-lg font-bold text-niki-ink">Payment</h2>
          {paymentEnabled ? (
            <p className="mt-2 text-sm text-niki-ink/60">
              Pay securely with <span className="font-medium text-niki-ink">Mobile Money</span> (MTN,
              Telecel, AirtelTigo) or a debit/credit card. You&apos;ll be taken to our secure payment
              page to complete your order.
            </p>
          ) : (
            <p className="mt-2 text-sm text-niki-ink/60">
              Payment is simulated in this build — placing the order marks it as paid. Mobile Money and
              card options are coming next.
            </p>
          )}
        </div>
      </div>

      <aside className="h-fit rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
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
        <dl className="mt-4 space-y-2 border-t border-niki-edge pt-4 text-sm">
          <div className="flex justify-between text-niki-ink/70">
            <dt>Subtotal</dt>
            <dd className="font-medium text-niki-ink">{formatPrice(subtotal)}</dd>
          </div>
          <div className="flex justify-between text-niki-ink/70">
            <dt>
              Shipping
              {quote && quote.totalCbm > 0 ? (
                <span className="flex items-center gap-1 text-xs text-niki-ink/40">
                  <Package className="h-3 w-3" /> {quote.totalCbm.toFixed(3)} CBM
                </span>
              ) : null}
            </dt>
            <dd className="font-medium text-niki-ink">
              {loadingQuote ? "…" : shippingFee === 0 ? "Free" : formatPrice(shippingFee)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-niki-edge pt-2 text-base font-bold text-niki-ink">
            <dt>Total</dt>
            <dd className="font-figures">{formatPrice(total)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={submit}
          disabled={pending || loadingQuote || !pickupPointId}
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
