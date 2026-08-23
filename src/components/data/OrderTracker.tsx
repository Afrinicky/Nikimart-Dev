import { PackageSearch } from "lucide-react";
import { DataOrderLookup } from "@/components/data/DataOrderLookup";
import { formatPrice } from "@/lib/format";
import { maskPhone, type LookupOutcome } from "@/lib/data-bundles/lookup";
import {
  DATA_STATUS_LABELS,
  DATA_STATUS_TONES,
  bundleLabel,
  isDataOrderStatus,
  networkLabel,
} from "@/lib/data-bundles/networks";

/**
 * "Where's my data?" — the whole tracker, shared by NikiMart's own page and
 * every agent storefront. Only `basePath` differs between them, so the buyer
 * experience is identical wherever they bought.
 */

function StatusPill({ status }: { status: string }) {
  const known = isDataOrderStatus(status) ? status : "processing";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DATA_STATUS_TONES[known]}`}>
      {DATA_STATUS_LABELS[known]}
    </span>
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

        {outcome.state === "found" ? (
          <ul className="stagger-children mt-5 space-y-3">
            {outcome.hits.map((hit) => (
              <li key={hit.reference} className="rounded-2xl bg-niki-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {hit.kind === "bundle" ? (
                      <p className="font-display font-bold text-niki-ink">
                        {bundleLabel(hit.sizeGb)} {networkLabel(hit.network)}
                      </p>
                    ) : (
                      <p className="font-display font-bold text-niki-ink">
                        AFA registration — {hit.fullName}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-niki-ink/50">
                      {hit.kind === "bundle"
                        ? `To ${maskPhone(hit.recipientPhone)}`
                        : `For ${maskPhone(hit.phoneNumber)}`}{" "}
                      · {new Date(hit.createdAt).toLocaleString("en-GH")}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusPill status={hit.status} />
                    <p className="mt-1 font-display text-sm font-bold text-niki-ink">
                      {formatPrice(hit.price)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 font-mono text-[11px] text-niki-ink/40">
                  {hit.reference}
                  {hit.kind === "bundle" && hit.providerCode ? ` · ${hit.providerCode}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}
