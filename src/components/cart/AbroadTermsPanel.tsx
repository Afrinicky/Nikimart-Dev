"use client";

import {
  Anchor,
  CalendarClock,
  Check,
  ExternalLink,
  MapPin,
  Plane,
  RotateCcw,
  Store,
  Users,
} from "lucide-react";
import type { CartAbroadItem } from "@/lib/checkout-actions";

/**
 * What a buyer of an imported item is agreeing to, shown before they pay.
 *
 * They are paying now for something that is still in another country, and will
 * be for weeks. The terms that govern that — how it travels, where it lands,
 * when it should arrive, what happens if it never does — were written by the
 * seller and rendered on the product page, but a buyer reaches checkout from a
 * cart they filled days ago, and nothing here repeated them. This does, per
 * item, immediately above the button that takes the money.
 *
 * The acknowledgement starts unticked and gates the order button. It is only a
 * claim from the browser — the server checks it again before an order with
 * imported items is accepted.
 */
export function AbroadTermsPanel({
  items,
  accepted,
  onAcceptedChange,
}: {
  items: CartAbroadItem[];
  accepted: boolean;
  onAcceptedChange: (next: boolean) => void;
}) {
  if (items.length === 0) return null;
  const one = items.length === 1;

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-orange/40">
      <div className="flex items-center gap-2">
        <Plane className="h-5 w-5 text-niki-orange" />
        <h2 className="font-display text-lg font-bold text-niki-ink">
          {one ? "This item ships from abroad" : "Your cart contains items shipped from abroad"}
        </h2>
      </div>
      <p className="mt-1 text-sm text-niki-ink/65">
        {one
          ? "It hasn't been shipped yet — the seller sources it once you order. Here's what they have committed to."
          : "These are sourced once you order. Here's what each seller has committed to."}
      </p>

      <ul className="mt-4 space-y-4">
        {items.map((item) => (
          <li key={item.productId} className="rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge">
            <p className="font-semibold text-niki-ink">
              {item.name}
              {item.quantity > 1 ? (
                <span className="font-normal text-niki-ink/50"> ×{item.quantity}</span>
              ) : null}
            </p>
            <dl className="mt-2 space-y-1.5 text-sm text-niki-ink/75">
              <Term icon={MapPin} label="Ships from" value={item.terms.sourceLocation} />
              <Term icon={Store} label="Supplier" value={item.terms.supplierName} />
              <Term icon={Plane} label="Freight method" value={item.freightModeLabel} />
              <Term icon={Anchor} label="Gathered at" value={item.pointName} />
              <Term
                icon={CalendarClock}
                label="Estimated arrival"
                value={
                  item.terms.estimatedArrival ||
                  (item.transitDays > 0 ? `about ${item.transitDays} days in transit` : "")
                }
              />
              <Term icon={RotateCcw} label="Refunds" value={item.terms.refundPolicy} />
              {item.terms.minimumOrders > 0 ? (
                <Term
                  icon={Users}
                  label="Ordered once bought by"
                  value={`${item.terms.minimumOrders} buyers`}
                />
              ) : null}
              {item.terms.supplierDelivers ? (
                <Term
                  icon={Plane}
                  label="Shipping"
                  value="The supplier brings it to Ghana. You pay only the run to your pickup station."
                />
              ) : null}
            </dl>
            {item.terms.sourceUrl ? (
              // The supplier listing, so a buyer can see the same item the
              // seller is buying. rel=noopener because it is a URL a seller
              // typed, and it opens in the buyer's browser.
              <a
                href={item.terms.sourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-niki-orange hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View the supplier&apos;s listing
              </a>
            ) : null}
          </li>
        ))}
      </ul>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-niki-orange/5 p-4 ring-1 ring-niki-orange/25">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
            accepted ? "bg-niki-orange text-white" : "bg-white ring-1 ring-niki-edge-control"
          }`}
        >
          {accepted ? <Check className="h-3.5 w-3.5" /> : null}
        </span>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
          className="sr-only"
        />
        <span className="text-sm text-niki-ink/80">
          I understand {one ? "this item is" : "these items are"} shipped from abroad and accept the{" "}
          {one ? "arrangement" : "arrangements"} above, including the arrival estimate and the refund
          terms.
        </span>
      </label>
    </section>
  );
}

function Term({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Plane;
  label: string;
  value: string;
}) {
  // A term the seller left blank is not shown as an empty row — a labelled
  // blank reads as a promise nobody made.
  if (!value.trim()) return null;
  return (
    <div className="flex gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-niki-orange" />
      <div>
        <dt className="inline font-medium text-niki-ink">{label}: </dt>
        <dd className="inline">{value}</dd>
      </div>
    </div>
  );
}
