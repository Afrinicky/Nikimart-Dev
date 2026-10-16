import { ExternalLink, Eye, FileText } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { PURCHASE_STATUS_LABELS, type PurchaseRecord } from "@/lib/purchasing";
import { updatePurchaseStatus } from "@/lib/purchasing-actions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Purchases already placed with a supplier.
 *
 * The reference is the thing to keep: it is what an admin quotes back to a
 * supplier, and what a seller reads to know their goods have actually been
 * bought. "Received" is the button that matters — confirming it moves every
 * customer order the purchase covers to "at freight forwarder", which is the
 * milestone a buyer who ordered a month ago is waiting to see.
 */

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

export function PlacedPurchasesTable({ purchases }: { purchases: PurchaseRecord[] }) {
  if (purchases.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-niki-edge">
        <FileText className="mx-auto h-8 w-8 text-niki-ink/30" />
        <p className="mt-3 font-semibold text-niki-ink">No purchases match these filters</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-niki-ink/60">
          Everything bought from a supplier is recorded here with its reference, so it can be quoted
          back and traced to the orders it covers.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-niki-surface/70">
              <th className={`${th} rounded-l-xl`}>Reference</th>
              <th className={th}>Supplier</th>
              <th className={th}>Shop</th>
              <th className={th}>Forwarder &amp; lane</th>
              <th className={th}>Volume</th>
              <th className={th}>Cost</th>
              <th className={th}>Placed</th>
              <th className={th}>Status</th>
              <th className={`${th} rounded-r-xl`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr
                key={p.id}
                className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
              >
                <td className={`${td} font-mono text-xs font-semibold text-niki-ink`}>
                  <ActionLink
                    href={`/admin/orders/placement/purchase/${p.id}`}
                    className="hover:text-niki-orange"
                  >
                    {p.reference}
                  </ActionLink>
                  {p.note ? (
                    <span
                      className="mt-0.5 block max-w-[12rem] truncate font-sans text-[11px] font-normal text-niki-ink/45"
                      title={p.note}
                    >
                      {p.note}
                    </span>
                  ) : null}
                </td>

                <td className={td}>
                  {p.supplierUrl ? (
                    <a
                      href={p.supplierUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex max-w-[12rem] items-center gap-1 truncate font-medium text-niki-ink hover:text-niki-orange"
                    >
                      <span className="truncate">{p.supplierName}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="font-medium text-niki-ink">{p.supplierName}</span>
                  )}
                  <span className="mt-0.5 block text-[11px] text-niki-ink/45">
                    {p.units} unit{p.units === 1 ? "" : "s"} · {p.itemCount} line
                    {p.itemCount === 1 ? "" : "s"}
                  </span>
                </td>

                <td className={`${td} text-xs text-niki-ink/70`}>{p.vendorName}</td>

                <td className={td}>
                  <span className="block text-xs font-medium text-niki-ink/80">{p.forwarderName}</span>
                  <span className="mt-0.5 block text-[11px] text-niki-ink/45">{p.routeLabel}</span>
                </td>

                <td className={`${td} font-figures text-niki-ink/75`}>{p.totalCbm.toFixed(3)} m³</td>

                <td className={`${td} font-figures font-semibold text-niki-ink`}>
                  {formatPrice(p.totalCost)}
                </td>

                <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
                  {p.placedAt
                    ? p.placedAt.toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                  {p.placedBy ? (
                    <span className="mt-0.5 block text-[11px] text-niki-ink/40">{p.placedBy}</span>
                  ) : null}
                </td>

                <td className={td}>
                  <span
                    className={cn(
                      "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      p.status === "received"
                        ? "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30"
                        : p.status === "cancelled"
                          ? "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/25"
                          : "bg-niki-orange/10 text-niki-orange ring-1 ring-niki-orange/25",
                    )}
                  >
                    {PURCHASE_STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </td>

                <td className={td}>
                  <div className="flex items-center gap-1">
                    <ActionLink
                      href={`/admin/orders/placement/purchase/${p.id}`}
                      aria-label={`Open ${p.reference}`}
                      title="Open the purchase — payments, receipts, the paper trail"
                      className="niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-niki-trust ring-1 ring-niki-edge hover:bg-niki-trust/10"
                    >
                      <Eye className="h-4 w-4" />
                    </ActionLink>
                    {p.status === "placed" ? (
                      <StatusButton
                        id={p.id}
                        status="received"
                        label="Forwarder has it"
                        title="Confirm the forwarder received this parcel — moves every order it covers on"
                      />
                    ) : null}
                    {p.status !== "cancelled" ? (
                      <StatusButton id={p.id} status="cancelled" label="Cancel" danger />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusButton({
  id,
  status,
  label,
  title,
  danger,
}: {
  id: string;
  status: string;
  label: string;
  title?: string;
  danger?: boolean;
}) {
  return (
    <form action={updatePurchaseStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        title={title}
        className={cn(
          "niki-press niki-focus whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
          danger
            ? "text-niki-danger hover:bg-niki-danger/10"
            : "text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5",
        )}
      >
        {label}
      </button>
    </form>
  );
}
