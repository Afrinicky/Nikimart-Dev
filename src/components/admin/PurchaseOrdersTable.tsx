import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { PURCHASE_STATUS_LABELS, type PurchaseRecord } from "@/lib/purchasing";
import { updatePurchaseStatus } from "@/lib/purchasing-actions";

/**
 * Purchases already placed with a supplier.
 *
 * The reference is the thing to keep: it is what an admin quotes back to a
 * supplier, and what a seller reads to know their goods have actually been
 * bought. Only an admin gets the buttons that move one along.
 */
export function PurchaseOrdersTable({
  purchases,
  readOnly = false,
}: {
  purchases: PurchaseRecord[];
  readOnly?: boolean;
}) {
  if (purchases.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-6 text-center text-sm text-niki-ink/60 ring-1 ring-niki-edge">
        No orders have been placed yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
          <tr>
            <th className="px-5 py-3 font-semibold">Reference</th>
            <th className="px-5 py-3 font-semibold">Supplier</th>
            <th className="px-5 py-3 font-semibold">Shop</th>
            <th className="px-5 py-3 font-semibold">Forwarder</th>
            <th className="px-5 py-3 font-semibold">Volume</th>
            <th className="px-5 py-3 font-semibold">Value</th>
            <th className="px-5 py-3 font-semibold">Placed</th>
            <th className="px-5 py-3 font-semibold">Status</th>
            {readOnly ? null : <th className="px-5 py-3 text-right font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-niki-edge">
          {purchases.map((p) => (
            <tr key={p.id}>
              <td className="px-5 py-3 font-figures font-medium text-niki-ink">{p.reference}</td>
              <td className="px-5 py-3 text-niki-ink/70">
                {p.supplierUrl ? (
                  <Link
                    href={p.supplierUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 hover:text-niki-orange"
                  >
                    {p.supplierName}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  p.supplierName
                )}
                <span className="block text-xs text-niki-ink/50">
                  {p.units} unit{p.units === 1 ? "" : "s"} · {p.itemCount} line
                  {p.itemCount === 1 ? "" : "s"}
                </span>
              </td>
              <td className="px-5 py-3 text-niki-ink/70">{p.vendorName}</td>
              <td className="px-5 py-3 text-niki-ink/70">
                {p.forwarderName}
                <span className="block text-xs text-niki-ink/50">{p.routeLabel}</span>
              </td>
              <td className="px-5 py-3 font-figures text-niki-ink/70">{p.totalCbm.toFixed(3)} m³</td>
              <td className="px-5 py-3 font-figures text-niki-ink/70">{formatPrice(p.totalCost)}</td>
              <td className="px-5 py-3 text-niki-ink/70">
                {p.placedAt ? p.placedAt.toLocaleDateString("en-GH") : "—"}
                {p.placedBy ? <span className="block text-xs text-niki-ink/50">{p.placedBy}</span> : null}
              </td>
              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    p.status === "received"
                      ? "bg-niki-success/10 text-niki-success"
                      : p.status === "cancelled"
                        ? "bg-niki-danger/10 text-niki-danger"
                        : "bg-niki-orange/10 text-niki-orange"
                  }`}
                >
                  {PURCHASE_STATUS_LABELS[p.status] ?? p.status}
                </span>
              </td>
              {readOnly ? null : (
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {p.status === "placed" ? (
                      <StatusButton id={p.id} status="received" label="Received" />
                    ) : null}
                    {p.status !== "cancelled" ? (
                      <StatusButton id={p.id} status="cancelled" label="Cancel" danger />
                    ) : null}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusButton({
  id,
  status,
  label,
  danger,
}: {
  id: string;
  status: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <form action={updatePurchaseStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          danger
            ? "text-niki-danger hover:bg-niki-danger/10"
            : "text-niki-ink/70 hover:bg-niki-black/5"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
