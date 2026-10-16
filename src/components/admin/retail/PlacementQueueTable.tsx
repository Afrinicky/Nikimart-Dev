"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Eye, Layers, Package, ShoppingCart, X } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { inputClass } from "@/components/ui/Field";
import { formatPrice } from "@/lib/format";
import { placePurchaseOrder, type PurchaseState } from "@/lib/purchasing-actions";
import { cn } from "@/lib/cn";

/**
 * What is waiting to be bought, and the one control that buys it.
 *
 * A queue row is one supplier on one lane — the parcel a forwarder will carry
 * — and it turns green when its volume clears that forwarder's minimum or its
 * ordering date comes round. Those are the two numbers that decide anything,
 * so they sit on the row rather than inside it.
 *
 * The checkboxes are the part that was missing. An admin buying from a
 * supplier buys everything from them in one sitting: the lane a parcel travels
 * on is the forwarder's business, not the supplier's, and paying two invoices
 * to the same shop on the same afternoon is work nobody needed. So rows can be
 * ticked and placed as a single purchase with a single reference — and only
 * rows from the same supplier can be ticked together, because a purchase is a
 * record of money sent to one person.
 */

export interface QueueRowView {
  key: string;
  token: string;
  supplierName: string;
  supplierUrl: string;
  supplierContact: string;
  /** How this supplier is identified across lanes — their link, else their name. */
  supplierKey: string;
  vendorName: string;
  forwarderName: string;
  forwarderId: string;
  routeId: string;
  routeLabel: string;
  destinationName: string;
  minCbm: number;
  totalCbm: number;
  totalUnits: number;
  goodsValue: number;
  thresholdMet: boolean;
  scheduleDue: boolean;
  schedule: string;
  dueAt: string;
  waitingSince: string;
  waitingDays: number;
  lineCount: number;
  orderCount: number;
  itemIds: string[];
}

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

function ReadyPill({ row }: { row: QueueRowView }) {
  const label = row.thresholdMet
    ? "Ready — minimum reached"
    : row.scheduleDue
      ? "Due — scheduled date"
      : "Building volume";
  const tone = row.thresholdMet
    ? "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30"
    : row.scheduleDue
      ? "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/25"
      : "bg-niki-gold/20 text-amber-900 ring-1 ring-niki-gold/30";
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export function PlacementQueueTable({ rows }: { rows: QueueRowView[] }) {
  const [picked, setPicked] = useState<string[]>([]);

  // Every tick narrows the rest to the same supplier: a purchase is money sent
  // to one person, and a reference that covers two of them is a reference
  // neither will recognise.
  const lockedTo = useMemo(() => {
    if (picked.length === 0) return null;
    const first = rows.find((r) => r.key === picked[0]);
    return first?.supplierKey ?? null;
  }, [picked, rows]);

  const selected = rows.filter((r) => picked.includes(r.key));
  const selectable = (row: QueueRowView) => lockedTo === null || row.supplierKey === lockedTo;

  function toggle(row: QueueRowView) {
    setPicked((prev) =>
      prev.includes(row.key) ? prev.filter((k) => k !== row.key) : [...prev, row.key],
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-niki-edge">
        <Package className="mx-auto h-8 w-8 text-niki-ink/30" />
        <p className="mt-3 font-semibold text-niki-ink">Nothing waiting to be ordered</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-niki-ink/60">
          Paid orders for goods coming from abroad gather here until there is enough volume from one
          supplier to be worth shipping.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[1140px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-niki-surface/70">
                <th className={`${th} w-10 rounded-l-xl`}>
                  <span className="sr-only">Select</span>
                </th>
                <th className={th}>Supplier</th>
                <th className={th}>Shop</th>
                <th className={th}>Forwarder &amp; lane</th>
                <th className={th}>Volume</th>
                <th className={th}>Goods value</th>
                <th className={th}>Waiting</th>
                <th className={th}>Status</th>
                <th className={`${th} rounded-r-xl`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const on = picked.includes(row.key);
                const allowed = selectable(row);
                const share = row.minCbm > 0 ? Math.min(1, row.totalCbm / row.minCbm) : 1;
                const ready = row.thresholdMet || row.scheduleDue;
                return (
                  <tr
                    key={row.key}
                    className={cn(
                      "border-b border-niki-edge transition-colors last:border-0",
                      on ? "bg-niki-orange/[0.06]" : "hover:bg-niki-surface/50",
                      !allowed && "opacity-45",
                    )}
                  >
                    <td className={td}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!allowed}
                        onChange={() => toggle(row)}
                        aria-label={`Select ${row.supplierName} on ${row.routeLabel}`}
                        title={
                          allowed
                            ? "Tick to place this with others from the same supplier"
                            : "Only rows from the same supplier can be placed together"
                        }
                        className="h-4 w-4 cursor-pointer rounded border-niki-edge-strong text-niki-orange accent-niki-orange disabled:cursor-not-allowed"
                      />
                    </td>

                    <td className={td}>
                      <ActionLink
                        href={`/admin/orders/placement/${row.token}`}
                        className="block max-w-[13rem] truncate font-semibold text-niki-ink hover:text-niki-orange"
                        title={row.supplierName}
                      >
                        {row.supplierName}
                      </ActionLink>
                      <span className="mt-0.5 block text-[11px] text-niki-ink/45">
                        {row.lineCount} line{row.lineCount === 1 ? "" : "s"} · {row.totalUnits} unit
                        {row.totalUnits === 1 ? "" : "s"} · {row.orderCount} order
                        {row.orderCount === 1 ? "" : "s"}
                      </span>
                    </td>

                    <td className={`${td} text-xs text-niki-ink/70`}>{row.vendorName}</td>

                    <td className={td}>
                      <span className="block text-xs font-medium text-niki-ink/80">
                        {row.forwarderName}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-niki-ink/45">
                        {row.routeLabel}
                        {row.destinationName ? ` → ${row.destinationName}` : ""}
                      </span>
                    </td>

                    <td className={td}>
                      <span className="font-figures font-semibold text-niki-ink">
                        {row.totalCbm.toFixed(3)} m³
                      </span>
                      <span className="mt-0.5 block text-[11px] text-niki-ink/45">
                        {row.minCbm > 0 ? `of ${row.minCbm} m³ minimum` : "no minimum set"}
                      </span>
                      <span className="mt-1.5 block h-1.5 w-28 overflow-hidden rounded-lg bg-niki-black/10">
                        <span
                          className={cn(
                            "block h-full rounded-lg",
                            ready ? "bg-niki-success" : "bg-niki-orange",
                          )}
                          style={{ width: `${Math.round(share * 100)}%` }}
                        />
                      </span>
                    </td>

                    <td className={`${td} font-figures font-semibold text-niki-ink`}>
                      {formatPrice(row.goodsValue)}
                    </td>

                    <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
                      {row.waitingDays} day{row.waitingDays === 1 ? "" : "s"}
                      <span className="mt-0.5 block text-[11px] text-niki-ink/40">
                        since {row.waitingSince}
                        {row.dueAt ? ` · next ${row.dueAt}` : ""}
                      </span>
                    </td>

                    <td className={td}>
                      <ReadyPill row={row} />
                    </td>

                    <td className={td}>
                      <div className="flex items-center gap-1.5">
                        <ActionLink
                          href={`/admin/orders/placement/${row.token}`}
                          aria-label={`Open ${row.supplierName}`}
                          title="Open the full placement"
                          className="niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-niki-trust ring-1 ring-niki-edge hover:bg-niki-trust/10"
                        >
                          <Eye className="h-4 w-4" />
                        </ActionLink>
                        {row.supplierUrl ? (
                          <a
                            href={row.supplierUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            aria-label="Open the supplier's listing"
                            title="Open the supplier's listing"
                            className="niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-niki-ink/55 ring-1 ring-niki-edge hover:bg-niki-black/5"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected.length > 0 ? (
        <BatchBar rows={selected} onClear={() => setPicked([])} />
      ) : null}
    </>
  );
}

/**
 * The bar that appears once rows are ticked.
 *
 * Fixed to the foot of the screen rather than placed under the table, because
 * the row somebody ticked may be the fortieth: a button they have to scroll to
 * find is a button they will not press. It carries the arithmetic of the
 * combined parcel — the volume it clears, what the goods cost — so the
 * decision is made where it is taken.
 */
function BatchBar({ rows, onClear }: { rows: QueueRowView[]; onClear: () => void }) {
  const [state, formAction] = useActionState<PurchaseState, FormData>(placePurchaseOrder, {});

  const first = rows[0];
  const totalCbm = Math.round(rows.reduce((s, r) => s + r.totalCbm, 0) * 1_000_000) / 1_000_000;
  const value = Math.round(rows.reduce((s, r) => s + r.goodsValue, 0) * 100) / 100;
  const units = rows.reduce((s, r) => s + r.totalUnits, 0);
  const itemIds = rows.flatMap((r) => r.itemIds);
  // The minimum only means anything where every ticked row is on one lane —
  // two lanes are two parcels to the forwarder, however they were bought.
  const oneLane = rows.every((r) => r.routeId === first.routeId && r.forwarderId === first.forwarderId);
  const minCbm = oneLane ? first.minCbm : 0;
  const short = oneLane && minCbm > 0 && totalCbm < minCbm;

  if (state.ok) {
    return (
      <div className="animate-fade-up sticky bottom-4 z-30 rounded-2xl bg-niki-success/10 p-4 ring-1 ring-niki-success/30">
        <p className="flex items-center gap-2 text-sm font-semibold text-niki-success">
          <CheckCircle2 className="h-4 w-4" />
          Recorded as {state.reference} — {state.orders ?? 0} customer order
          {state.orders === 1 ? "" : "s"} moved to “ordered from supplier”.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {state.purchaseId ? (
            <ActionLink
              href={`/admin/orders/placement/purchase/${state.purchaseId}`}
              className="niki-press niki-focus rounded-full bg-niki-black px-4 py-2 text-xs font-semibold text-white"
            >
              Record what was paid
            </ActionLink>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="niki-press niki-focus rounded-full px-3 py-2 text-xs font-semibold text-niki-ink/60 hover:bg-niki-black/5"
          >
            Clear the selection
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="animate-fade-up sticky bottom-4 z-30 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-niki-orange/40"
    >
      <input type="hidden" name="itemIds" value={itemIds.join(",")} />
      <input type="hidden" name="supplierName" value={first.supplierName} />
      <input type="hidden" name="supplierUrl" value={first.supplierUrl} />
      <input type="hidden" name="supplierContact" value={first.supplierContact} />
      <input type="hidden" name="forwarderId" value={oneLane ? first.forwarderId : ""} />
      <input type="hidden" name="routeId" value={oneLane ? first.routeId : ""} />
      <input type="hidden" name="totalCbm" value={totalCbm} />

      {state.error ? (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-niki-danger/10 px-4 py-2.5 text-sm font-medium text-niki-danger"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <p className="flex items-center gap-2 text-sm font-bold text-niki-ink">
            <Layers className="h-4 w-4 text-niki-orange" />
            {rows.length} parcel{rows.length === 1 ? "" : "s"} from {first.supplierName}
          </p>
          <p className="mt-0.5 text-xs text-niki-ink/55">
            {totalCbm.toFixed(3)} m³ · {units} unit{units === 1 ? "" : "s"} · {formatPrice(value)}
            {oneLane ? "" : " · across more than one lane"}
          </p>
          <label htmlFor="batch-note" className="mt-2 block text-xs font-medium text-niki-ink/70">
            Note on this purchase
          </label>
          <input
            id="batch-note"
            name="note"
            placeholder="Supplier invoice, agreed price, anything worth keeping"
            className={cn(inputClass, "mt-1 py-2 text-sm")}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-niki-ink/60 hover:bg-niki-black/5"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
          <button
            type="submit"
            className="niki-press niki-focus inline-flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white"
          >
            <ShoppingCart className="h-4 w-4" />
            Mark {rows.length === 1 ? "as ordered" : `all ${rows.length} as ordered`}
          </button>
        </div>
      </div>

      {short ? (
        <p className="mt-2 text-xs text-amber-900">
          Still under {first.forwarderName}&apos;s {minCbm} m³ minimum. Ordering now means paying for
          space you are not filling.
        </p>
      ) : null}
    </form>
  );
}
