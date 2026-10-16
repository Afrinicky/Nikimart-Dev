"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Layers, ShieldAlert, ShoppingCart } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { inputClass } from "@/components/ui/Field";
import { formatPrice } from "@/lib/format";
import { placePurchaseOrder, type PurchaseState } from "@/lib/purchasing-actions";
import { cn } from "@/lib/cn";

/**
 * Recording the purchase, from the window that describes it.
 *
 * The one place money is committed to a supplier, so it says what it is about
 * to do in figures before it does it. Where the same supplier has other
 * parcels waiting — a second lane, another shop's goods — they are offered
 * here as tick boxes, because the alternative is paying one shop twice in one
 * afternoon and holding two references for it.
 */

export interface PlaceParcel {
  key: string;
  label: string;
  note: string;
  cbm: number;
  value: number;
  units: number;
  itemIds: string[];
}

export function PlaceGroupForm({
  supplierName,
  supplierUrl,
  supplierContact,
  forwarderId,
  forwarderName,
  routeId,
  minCbm,
  thresholdMet,
  main,
  siblings,
}: {
  supplierName: string;
  supplierUrl: string;
  supplierContact: string;
  forwarderId: string;
  forwarderName: string;
  routeId: string;
  minCbm: number;
  thresholdMet: boolean;
  main: PlaceParcel;
  /** Other parcels from this same supplier, which can be bought in one go. */
  siblings: PlaceParcel[];
}) {
  const [also, setAlso] = useState<string[]>([]);
  const [state, formAction] = useActionState<PurchaseState, FormData>(placePurchaseOrder, {});

  const chosen = [main, ...siblings.filter((s) => also.includes(s.key))];
  const cbm = Math.round(chosen.reduce((s, p) => s + p.cbm, 0) * 1_000_000) / 1_000_000;
  const value = Math.round(chosen.reduce((s, p) => s + p.value, 0) * 100) / 100;
  const units = chosen.reduce((s, p) => s + p.units, 0);
  const itemIds = chosen.flatMap((p) => p.itemIds);
  const combined = chosen.length > 1;

  if (state.ok) {
    return (
      <div className="animate-scale-in rounded-2xl bg-niki-success/10 p-6 ring-1 ring-niki-success/30">
        <CheckCircle2 className="h-8 w-8 text-niki-success" />
        <p className="mt-2 font-display text-lg font-bold text-niki-ink">
          Recorded as {state.reference}
        </p>
        <p className="mt-1 text-sm text-niki-ink/70">
          {state.orders ?? 0} customer order{state.orders === 1 ? "" : "s"} moved to “ordered from
          supplier”, and {state.orders === 1 ? "its buyer" : "their buyers"} can see it. Confirm the
          forwarder has the parcel when they report it in.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionLink
            href="/admin/orders/placement"
            className="niki-press niki-focus rounded-full bg-niki-black px-5 py-2 text-sm font-semibold text-white"
          >
            Back to the queue
          </ActionLink>
          <ActionLink
            href="/admin/orders"
            className="niki-press niki-focus rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/65 ring-1 ring-niki-edge hover:bg-niki-black/5"
          >
            See the orders
          </ActionLink>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <input type="hidden" name="itemIds" value={itemIds.join(",")} />
      <input type="hidden" name="supplierName" value={supplierName} />
      <input type="hidden" name="supplierUrl" value={supplierUrl} />
      <input type="hidden" name="supplierContact" value={supplierContact} />
      <input type="hidden" name="forwarderId" value={combined ? "" : forwarderId} />
      <input type="hidden" name="routeId" value={combined ? "" : routeId} />
      <input type="hidden" name="totalCbm" value={cbm} />

      <h2 className="font-display font-bold text-niki-ink">Record the purchase</h2>
      <p className="mt-1 text-sm text-niki-ink/60">
        Buy the items from {supplierName}, then record it here. Every order this covers moves on at
        once, and its buyer is told.
      </p>

      {state.error ? (
        <p
          role="alert"
          className="animate-fade-up mt-3 flex items-start gap-2 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      {siblings.length > 0 ? (
        <fieldset className="mt-4 rounded-xl bg-niki-surface/60 p-4 ring-1 ring-niki-edge">
          <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
            <Layers className="h-3.5 w-3.5" />
            Also from {supplierName}
          </legend>
          <p className="mb-2 text-xs text-niki-ink/55">
            Tick any of these to buy them in the same purchase, under one reference.
          </p>
          <div className="space-y-2">
            {siblings.map((s) => (
              <label key={s.key} className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={also.includes(s.key)}
                  onChange={() =>
                    setAlso((prev) =>
                      prev.includes(s.key) ? prev.filter((k) => k !== s.key) : [...prev, s.key],
                    )
                  }
                  className="mt-0.5 h-4 w-4 rounded border-niki-edge-strong accent-niki-orange"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-niki-ink">{s.label}</span>
                  <span className="block text-xs text-niki-ink/50">
                    {s.note} · {s.cbm.toFixed(3)} m³ · {formatPrice(s.value)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-niki-black/[0.03] px-4 py-3 text-sm">
        <span className="text-niki-ink/55">
          Buying{" "}
          <span className="font-semibold text-niki-ink">
            {chosen.length} parcel{chosen.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="text-niki-ink/55">
          Volume <span className="font-figures font-semibold text-niki-ink">{cbm.toFixed(3)} m³</span>
        </span>
        <span className="text-niki-ink/55">
          Units <span className="font-figures font-semibold text-niki-ink">{units}</span>
        </span>
        <span className="text-niki-ink/55">
          Goods{" "}
          <span className="font-figures font-semibold text-niki-ink">{formatPrice(value)}</span>
        </span>
      </div>

      <div className="mt-4">
        <label htmlFor="place-note" className="mb-1.5 block text-sm font-medium text-niki-ink">
          Note on this purchase
        </label>
        <input
          id="place-note"
          name="note"
          placeholder="Supplier invoice number, agreed price, anything worth keeping"
          className={inputClass}
        />
      </div>

      {!thresholdMet && minCbm > 0 && !combined ? (
        <p className="mt-3 rounded-xl bg-niki-gold/15 px-4 py-2.5 text-xs text-amber-900 ring-1 ring-niki-gold/30">
          This parcel is under {forwarderName}&apos;s {minCbm} m³ minimum. Ordering now means paying
          for space you are not filling — unless there is a reason not to wait.
        </p>
      ) : null}

      <button
        type="submit"
        className={cn(
          "niki-press niki-focus mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white sm:w-auto",
          thresholdMet || combined ? "bg-niki-orange" : "bg-niki-black",
        )}
      >
        <ShoppingCart className="h-4 w-4" />
        {combined ? `Mark all ${chosen.length} as ordered` : "Mark as ordered"}
      </button>
    </form>
  );
}
