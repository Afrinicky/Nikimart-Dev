"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Package, ShoppingCart } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatPrice } from "@/lib/format";
import type { QueueGroup } from "@/lib/purchasing";
import { placePurchaseOrder, type PurchaseState } from "@/lib/purchasing-actions";

/**
 * The queue: what is bought, what it is waiting for, and the link to go buy it.
 *
 * One row is one supplier on one lane — the parcel that will be shipped — so
 * the two numbers that decide anything sit on the row itself: how much volume
 * has gathered, and how much the forwarder needs before they will carry it. The
 * supplier's link and contact are on the row too, because the whole point of
 * this screen is that an admin can act on it without going anywhere else.
 *
 * Only an admin sees the order button; the seller's table renders the same rows
 * with `readOnly` and no way to act.
 */
export function PurchaseQueueTable({
  groups,
  readOnly = false,
}: {
  groups: QueueGroup[];
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-niki-edge">
        <Package className="mx-auto h-8 w-8 text-niki-ink/30" />
        <p className="mt-3 font-semibold text-niki-ink">Nothing waiting to be ordered</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-niki-ink/60">
          Paid orders for goods coming from abroad gather here until there is enough volume from
          one supplier to be worth shipping.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const ready = g.thresholdMet || g.scheduleDue;
        const share = g.minCbm > 0 ? Math.min(1, g.totalCbm / g.minCbm) : 1;
        const expanded = open === g.key;
        return (
          <div
            key={g.key}
            className={`overflow-hidden rounded-2xl bg-white ring-1 ${
              ready ? "ring-niki-success/40" : "ring-niki-edge"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-[16rem] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-niki-ink">{g.supplierName}</h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      ready
                        ? "bg-niki-success/10 text-niki-success"
                        : "bg-niki-gold/20 text-amber-900"
                    }`}
                  >
                    {g.thresholdMet
                      ? "Ready — minimum reached"
                      : g.scheduleDue
                        ? "Due — scheduled order date"
                        : "Building volume"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-niki-ink/60">
                  {g.vendorName} · {g.forwarderName}
                  {g.routeLabel ? ` · ${g.routeLabel}` : ""}
                  {g.destinationName ? ` → ${g.destinationName}` : ""}
                </p>
                <p className="mt-1 text-xs text-niki-ink/50">
                  {g.supplierContact ? `${g.supplierContact} · ` : ""}
                  Waiting since {g.waitingSince.toLocaleDateString("en-GH")}
                  {g.schedule ? ` · ${g.schedule}` : ""}
                  {g.dueAt ? ` · next ${g.dueAt.toLocaleDateString("en-GH")}` : ""}
                </p>
              </div>

              <div className="w-44">
                <p className="font-figures text-lg font-bold text-niki-ink">
                  {g.totalCbm.toFixed(3)} m³
                </p>
                <p className="text-xs text-niki-ink/50">
                  {g.minCbm > 0 ? `of ${g.minCbm} m³ minimum` : "no minimum set"}
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-niki-black/10">
                  <div
                    className={`h-full rounded-full ${ready ? "bg-niki-success" : "bg-niki-orange"}`}
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </div>
              </div>

              <div className="w-32 text-right">
                <p className="font-figures text-lg font-bold text-niki-ink">
                  {formatPrice(g.goodsValue)}
                </p>
                <p className="text-xs text-niki-ink/50">
                  {g.totalUnits} unit{g.totalUnits === 1 ? "" : "s"} · {g.lines.length} line
                  {g.lines.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {g.supplierUrl ? (
                  <a
                    href={g.supplierUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex items-center gap-1.5 rounded-full bg-niki-black px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-niki-black/85"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Supplier
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : g.key)}
                  aria-expanded={expanded}
                  className="flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
                >
                  {g.lines.length} item{g.lines.length === 1 ? "" : "s"}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
            </div>

            {expanded ? (
              <div className="border-t border-niki-edge bg-niki-surface/60 px-5 py-4">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-niki-ink/50">
                      <tr>
                        <th className="pb-2 pr-3 font-semibold">Product</th>
                        <th className="pb-2 pr-3 font-semibold">Order</th>
                        <th className="pb-2 pr-3 font-semibold">Buyer</th>
                        <th className="pb-2 pr-3 font-semibold">Qty</th>
                        <th className="pb-2 pr-3 font-semibold">Volume</th>
                        <th className="pb-2 font-semibold">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-niki-edge">
                      {g.lines.map((l) => (
                        <tr key={l.orderItemId}>
                          <td className="py-2 pr-3">
                            <Link
                              href={`/products/${l.productSlug}`}
                              className="font-medium text-niki-ink hover:text-niki-orange"
                            >
                              {l.productName}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 font-figures text-niki-ink/70">{l.orderNumber}</td>
                          <td className="py-2 pr-3 text-niki-ink/70">{l.buyerName}</td>
                          <td className="py-2 pr-3 font-figures text-niki-ink/70">{l.quantity}</td>
                          <td className="py-2 pr-3 font-figures text-niki-ink/70">
                            {l.cbm.toFixed(4)} m³
                          </td>
                          <td className="py-2 font-figures text-niki-ink/70">
                            {formatPrice(l.unitPrice * l.quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {readOnly ? (
                  <p className="mt-4 text-xs text-niki-ink/50">
                    NikiMart places these orders with your supplier. You will see the reference here
                    once it has been bought.
                  </p>
                ) : (
                  <PlaceForm group={g} />
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** The order button, and the note that goes on the record. */
function PlaceForm({ group }: { group: QueueGroup }) {
  const [state, formAction] = useActionState<PurchaseState, FormData>(placePurchaseOrder, {});

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="itemIds" value={group.lines.map((l) => l.orderItemId).join(",")} />
      <input type="hidden" name="supplierName" value={group.supplierName} />
      <input type="hidden" name="supplierUrl" value={group.supplierUrl} />
      <input type="hidden" name="supplierContact" value={group.supplierContact} />
      <input type="hidden" name="forwarderId" value={group.forwarderId ?? ""} />
      <input type="hidden" name="routeId" value={group.routeId ?? ""} />
      <input type="hidden" name="totalCbm" value={group.totalCbm} />

      {state.error ? (
        <p role="alert" className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
          Recorded as {state.reference} ✓
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor={`note-${group.key}`} className="mb-1.5 block text-sm font-medium text-niki-ink">
            Note on this purchase
          </label>
          <input
            id={`note-${group.key}`}
            name="note"
            placeholder="Supplier invoice, agreed price, anything worth keeping"
            className={inputClass}
          />
        </div>
        <div className="w-52">
          <SubmitButton>
            <span className="flex items-center justify-center gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              Mark as ordered
            </span>
          </SubmitButton>
        </div>
      </div>
      {!group.thresholdMet && group.minCbm > 0 ? (
        <p className="text-xs text-amber-900">
          This is under {group.forwarderName}&apos;s {group.minCbm} m³ minimum. Ordering now means
          paying for space you are not filling.
        </p>
      ) : null}
    </form>
  );
}
