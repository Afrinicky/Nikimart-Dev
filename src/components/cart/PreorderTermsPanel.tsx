"use client";

import { CalendarClock, Check, Clock3, MapPin, RotateCcw, Users, Wallet } from "lucide-react";
import { describeDeposit } from "@/lib/preorder";
import type { CartPreorderItem } from "@/lib/preorder-actions";

/**
 * What a preorder buyer is agreeing to, shown before they pay.
 *
 * A preorder is money handed over now for something that will be sourced and
 * shipped weeks later. The terms that govern that — when it should arrive, how
 * much is due up front, what happens if it never comes — were written by the
 * seller and rendered on the product page, but a buyer reaches checkout from a
 * cart they filled days ago, and nothing here repeated them. This does, per
 * item, immediately above the button that takes the money.
 *
 * The acknowledgement starts unticked and gates the order button. As with the
 * registration gate, the checkbox is only a claim from the browser — the server
 * checks it again before an order with preorder items is accepted.
 */
export function PreorderTermsPanel({
  items,
  accepted,
  onAcceptedChange,
}: {
  items: CartPreorderItem[];
  accepted: boolean;
  onAcceptedChange: (next: boolean) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-orange/40">
      <div className="flex items-center gap-2">
        <Clock3 className="h-5 w-5 text-niki-orange" />
        <h2 className="font-display text-lg font-bold text-niki-ink">
          {items.length === 1 ? "This is a preorder" : "Your cart contains preorders"}
        </h2>
      </div>
      <p className="mt-1 text-sm text-niki-ink/65">
        {items.length === 1
          ? "It hasn't been made or shipped yet. Here's what the seller has committed to."
          : "These items haven't been made or shipped yet. Here's what each seller has committed to."}
      </p>

      <ul className="mt-4 space-y-4">
        {items.map((item) => (
          <li key={item.productId} className="rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge">
            <p className="font-semibold text-niki-ink">{item.name}</p>
            <dl className="mt-2 space-y-1.5 text-sm text-niki-ink/75">
              <Term icon={CalendarClock} label="Estimated arrival" value={item.terms.estimatedArrival} />
              <Term icon={Clock3} label="Preorder closes" value={item.terms.closingDate} />
              <Term icon={MapPin} label="Sourced from" value={item.terms.sourceLocation} />
              <Term icon={Wallet} label="Payment" value={describeDeposit(item.terms)} />
              {item.terms.depositRequired ? (
                <Term icon={Wallet} label="Balance" value={item.terms.balanceInstruction} />
              ) : null}
              <Term icon={RotateCcw} label="Refunds" value={item.terms.refundPolicy} />
              {item.terms.minimumOrders > 0 ? (
                <Term
                  icon={Users}
                  label="Ships once ordered by"
                  value={`${item.terms.minimumOrders} buyers`}
                />
              ) : null}
            </dl>
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
          I understand {items.length === 1 ? "this item is" : "these items are"} a preorder and
          accept the {items.length === 1 ? "arrangement" : "arrangements"} above, including the
          arrival estimate and refund terms.
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
  icon: typeof Clock3;
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
