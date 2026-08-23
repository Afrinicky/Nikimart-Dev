import { PackageSearch } from "lucide-react";
import { DataOrderLookup } from "@/components/data/DataOrderLookup";
import { formatPrice } from "@/lib/format";
import { maskPhone, type LookupHit, type LookupOutcome } from "@/lib/data-bundles/lookup";
import {
  DATA_STATUS_LABELS,
  DATA_STATUS_TONES,
  bundleLabel,
  isDataOrderStatus,
  networkLabel,
  type DataOrderStatus,
} from "@/lib/data-bundles/networks";

/**
 * "Where's my data?" — the whole tracker, shared by NikiMart's own page and
 * every agent storefront. Only `basePath` differs between them, so the buyer
 * experience is identical wherever they bought.
 */

function StatusPill({ status }: { status: string }) {
  const known = isDataOrderStatus(status) ? status : "processing";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold tracking-wide ${DATA_STATUS_TONES[known]}`}
    >
      <StatusDot status={known} />
      {DATA_STATUS_LABELS[known]}
    </span>
  );
}

/** A pulsing dot while work is still happening, a still one once it isn't. */
function StatusDot({ status }: { status: DataOrderStatus }) {
  const live = status === "paid" || status === "processing";
  return (
    <span className="relative flex h-2 w-2" aria-hidden>
      {live ? (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
      ) : null}
      <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
    </span>
  );
}

/**
 * What to tell someone standing on this status.
 *
 * A bundle and an AFA registration reach the same statuses by different routes,
 * and "your bundle is on its way" is the wrong sentence to show somebody who
 * registered for AFA — so each kind gets its own words.
 */
const STATUS_NOTE: Record<"bundle" | "afa", Record<DataOrderStatus, string>> = {
  bundle: {
    pending:
      "This order hasn't been paid for yet. Nothing was charged — order it again to complete payment.",
    paid: "Payment received. Your bundle is on its way — this page updates as it goes.",
    processing: "Your bundle is being sent now — this page updates as it goes.",
    completed: "Sent. If the data hasn't shown on the number, dial your network's balance check.",
    failed:
      "This one didn't go through. Nothing stays charged — contact support with the reference below.",
    refunded: "This order was refunded. The money is on its way back to where it was paid from.",
  },
  afa: {
    pending:
      "This registration hasn't been paid for yet. Nothing was charged — submit it again to complete payment.",
    paid: "Payment received. Your registration has been sent for approval.",
    processing: "Your registration is with the network for approval.",
    completed: "Approved. The number is registered and agent rates apply to it.",
    failed:
      "This registration wasn't accepted. Nothing stays charged — contact support with the reference below.",
    refunded: "This registration was refunded. The money is on its way back to where it was paid from.",
  },
};

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-niki-ink/45">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-niki-ink">{value}</dd>
    </div>
  );
}

/**
 * The one order being tracked.
 *
 * Status first and largest: it is the only thing the person came to find out.
 * Everything else is the supporting detail that proves it is the right order.
 */
function OrderCard({ hit }: { hit: LookupHit }) {
  const status = isDataOrderStatus(hit.status) ? hit.status : "processing";
  const title =
    hit.kind === "bundle"
      ? `${bundleLabel(hit.sizeGb)} ${networkLabel(hit.network)}`
      : `AFA registration — ${hit.fullName}`;
  const recipient = hit.kind === "bundle" ? hit.recipientPhone : hit.phoneNumber;

  return (
    <div className="animate-fade-up mt-5 overflow-hidden rounded-2xl bg-niki-surface ring-1 ring-niki-edge-strong">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="font-figures text-xl font-bold text-niki-ink">{title}</p>
          <p className="mt-1 text-sm text-niki-ink/60">To {maskPhone(recipient)}</p>
        </div>
        <StatusPill status={status} />
      </div>

      <p className="border-t border-niki-edge px-5 py-4 text-sm leading-relaxed text-niki-ink/70">
        {STATUS_NOTE[hit.kind][status]}
      </p>

      <dl className="grid grid-cols-2 gap-4 border-t border-niki-edge bg-white p-5 sm:grid-cols-3">
        <Detail label="Amount" value={formatPrice(hit.price)} />
        <Detail
          label="Ordered"
          value={new Date(hit.createdAt).toLocaleString("en-GH", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        />
        <Detail
          label="Reference"
          value={<span className="font-mono text-xs">{hit.reference}</span>}
        />
      </dl>
    </div>
  );
}

export function OrderTracker({
  outcome,
  query,
  basePath,
  notices,
}: {
  outcome: LookupOutcome;
  query: string;
  basePath: string;
  notices: { paid?: boolean; afa?: boolean; failed?: boolean };
}) {
  return (
    <>
      {notices.paid ? (
        <p className="animate-fade-up mb-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/30">
          Payment received. Your bundle is being sent now — this page updates as it progresses.
        </p>
      ) : null}
      {notices.afa ? (
        <p className="animate-fade-up mb-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/30">
          Payment received. Your AFA registration has been submitted for approval.
        </p>
      ) : null}
      {notices.failed ? (
        <p className="animate-fade-up mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 ring-1 ring-amber-200">
          We couldn&apos;t confirm that payment yet. If it left your wallet, it will settle shortly —
          check back here in a minute before paying again.
        </p>
      ) : null}

      <div className="rounded-3xl bg-white p-6 ring-1 ring-niki-edge sm:p-8">
        <div className="mb-4 flex items-center gap-2">
          <PackageSearch className="h-5 w-5 text-niki-orange" />
          <h2 className="font-semibold text-niki-ink">Where&apos;s my data?</h2>
        </div>
        <DataOrderLookup defaultValue={query} basePath={basePath} />

        {outcome.state === "error" ? (
          <p className="animate-fade-up mt-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
            {outcome.message}
          </p>
        ) : null}

        {outcome.state === "empty" ? (
          <p className="animate-fade-up mt-4 rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/60">
            No orders found for “{query}”. Check the reference, or search with the phone number you
            paid with.
          </p>
        ) : null}

        {outcome.state === "found" && outcome.hits[0] ? (
          <OrderCard hit={outcome.hits[0]} />
        ) : null}
      </div>
    </>
  );
}
