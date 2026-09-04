"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CreditCard, MapPin, Package, Plane, Scale } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCart } from "@/components/providers/CartProvider";
import { formatPrice } from "@/lib/format";
import { placeOrder } from "@/lib/order-actions";
import { quoteCart, type CartQuote } from "@/lib/checkout-actions";
import { emptyBill, type PaymentPlan } from "@/lib/cart-bill";
import { AbroadTermsPanel } from "@/components/cart/AbroadTermsPanel";
import { CheckoutBill, PaymentPlanChoice } from "@/components/cart/CheckoutBill";

/**
 * Checkout.
 *
 * The page holds no pricing logic at all. It asks the server to quote the cart
 * at every pickup station and renders what comes back — the bill, the
 * imported-item terms, the payment choice. That is deliberate: behind the one
 * shipping figure a buyer sees there are freight legs, duty and two tax
 * jurisdictions, and a client that recomputed any of it would eventually quote
 * a number the order action disagreed with.
 */
export function CheckoutClient({
  defaultPickupId = "",
  paymentEnabled = false,
}: {
  defaultPickupId?: string;
  paymentEnabled?: boolean;
}) {
  const { items, subtotal, clear, ready } = useCart();
  const router = useRouter();

  const [quote, setQuote] = useState<CartQuote | null>(null);
  // Which cart contents the current quote was fetched for. Anything else means
  // a fetch is still in flight — derived rather than a second state flag.
  const [quotedFor, setQuotedFor] = useState<string | null>(null);
  const [pickupPointId, setPickupPointId] = useState(defaultPickupId);
  const [plan, setPlan] = useState<PaymentPlan>("full");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [acceptedAbroad, setAcceptedAbroad] = useState(false);
  // A stable key so the quote refetches only when something that moves the
  // price changes: the cart, or the chosen station. The lane an imported item
  // travels on is the seller's choice, made when they listed it, so there is
  // nothing for a buyer to pick between here.
  const itemsKey = useMemo(
    () => items.map((i) => `${i.productId}:${i.quantity}`).join("|"),
    [items],
  );
  const quoteKey = `${itemsKey}::${pickupPointId}`;

  useEffect(() => {
    // Nothing to quote for an empty cart, and nothing reads the quote either —
    // the empty-cart state renders before any of it is used.
    if (!ready || items.length === 0) return;
    let cancelled = false;
    quoteCart({
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      destPickupId: pickupPointId,
    })
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        setQuotedFor(quoteKey);
        setPickupPointId((prev) =>
          prev && q.points.some((p) => p.id === prev) ? prev : (q.points[0]?.id ?? ""),
        );
        // Changing the cart invalidates both the acceptance and the plan: the
        // first was given for different terms, the second for a different bill.
        setAcceptedAbroad(false);
        if (!q.payShippingOnPickup) setPlan("full");
      })
      .catch(() => {
        if (cancelled) return;
        setQuote(null);
        setQuotedFor(quoteKey);
      });
    return () => {
      cancelled = true;
    };
    // quoteKey captures the meaningful state: the cart and the station.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, ready]);

  const loadingQuote = quotedFor !== quoteKey;
  const points = quote?.points ?? [];
  const selected = points.find((p) => p.id === pickupPointId);
  // Before the first quote lands there is still a cart to show, so the goods
  // total from the browser stands in for the bill. It is replaced, not
  // supplemented, the moment the server answers.
  const bill = selected?.bill ?? emptyBill(subtotal, 0);
  const abroadItems = quote?.items ?? [];
  const consignments = quote?.consignments ?? [];
  const moqAdjustments = quote?.moqAdjustments ?? [];
  const dueNow = plan === "shipping_on_pickup" ? bill.goodsOnlyNow : bill.total;

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
    if (abroadItems.length > 0 && !acceptedAbroad) {
      setError("Please read and accept the shipped-from-abroad terms before paying.");
      return;
    }
    if (moqAdjustments.length > 0) {
      setError("Some items are sold in minimum quantities. Please update your cart first.");
      return;
    }
    setPending(true);
    const res = await placeOrder({
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      pickupPointId,
      acceptedAbroadTerms: acceptedAbroad,
      paymentPlan: plan,
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
          <p role="alert" className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{error}</p>
        ) : null}

        {moqAdjustments.length > 0 ? (
          // The server raised these to the seller's minimum when it priced the
          // cart, and will refuse the order otherwise. Saying so here beats
          // letting the buyer reach the button and be turned away.
          <p className="rounded-xl bg-niki-gold/15 px-4 py-3 text-sm font-medium text-amber-900">
            {moqAdjustments.map((m) => `${m.name} is sold in minimums of ${m.moq}`).join("; ")}.
            Please update the quantities in your cart.
          </p>
        ) : null}

        {quote?.unpricedRoute ? (
          // A route nobody has priced would quote zero freight into Ghana.
          // Saying so here beats letting the buyer reach the button and be
          // refused by the server with no idea why.
          <p className="rounded-xl bg-niki-gold/15 px-4 py-3 text-sm font-medium text-amber-900">
            Shipping into Ghana isn&apos;t priced yet for one of these items, so it can&apos;t be
            ordered right now. Please check back shortly or contact support.
          </p>
        ) : null}

        <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-niki-orange" />
            <h2 className="font-display text-lg font-bold text-niki-ink">Choose a pickup point</h2>
          </div>
          <p className="mt-1 text-sm text-niki-ink/60">
            Each seller&apos;s items are brought together, checked, and couriered to the station you
            pick. One seller&apos;s order is one delivery, however many items it has — and it costs
            nothing at all when your items are already at the station you choose.
          </p>

          {quote?.hasAbroad ? (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-niki-black/5 px-3 py-2 text-xs font-medium text-niki-ink/70">
              <Plane className="h-4 w-4 text-niki-orange" /> Some items come from abroad. Everything
              it takes to get them here is already in the figures below.
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
                    <span className="shrink-0 text-right text-sm font-semibold text-niki-ink">
                      {p.fee === 0 ? <span className="text-niki-success">Free</span> : formatPrice(p.fee)}
                      {p.collectedHere ? (
                        <span className="block text-xs font-normal text-niki-ink/50">
                          Already here
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <AbroadTermsPanel
          items={abroadItems}
          accepted={acceptedAbroad}
          onAcceptedChange={setAcceptedAbroad}
        />

        {quote?.payShippingOnPickup ? (
          <PaymentPlanChoice
            bill={bill}
            plan={plan}
            onPlanChange={setPlan}
            disabled={loadingQuote || !pickupPointId}
          />
        ) : null}

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

        {consignments.length > 1 ? (
          // Why two base fees? Because two shops are handing over two loads.
          // A buyer who cannot see that reads the total as a mistake.
          <div className="mt-4 rounded-xl bg-niki-surface p-3 text-xs text-niki-ink/65 ring-1 ring-niki-edge">
            <p className="flex items-center gap-1 font-semibold text-niki-ink">
              <Package className="h-3.5 w-3.5" /> Shipping is per seller
            </p>
            <ul className="mt-1.5 space-y-1">
              {consignments.map((c) => (
                <li key={c.sellerName} className="flex justify-between gap-2">
                  <span className="line-clamp-1">
                    {c.sellerName}{" "}
                    <span className="text-niki-ink/40">
                      · {c.units} item{c.units === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-niki-ink">
                    {c.collectedAtOrigin || c.fee === 0 ? "Free" : formatPrice(c.fee)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {quote && quote.totalWeightKg > 0 ? (
          <p className="mt-3 flex items-center gap-1 text-xs text-niki-ink/40">
            <Scale className="h-3 w-3" /> {quote.totalWeightKg} kg billable weight
          </p>
        ) : null}

        <div className="mt-4 border-t border-niki-edge pt-4">
          <CheckoutBill bill={bill} plan={plan} loading={loadingQuote} />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={
            pending ||
            loadingQuote ||
            !pickupPointId ||
            quote?.unpricedRoute ||
            moqAdjustments.length > 0 ||
            (abroadItems.length > 0 && !acceptedAbroad)
          }
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-niki-orange px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Placing order…" : `Place order · ${formatPrice(dueNow)}`}
        </button>
        <Link href="/cart" className="mt-3 block text-center text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Back to cart
        </Link>
      </aside>
    </div>
  );
}
