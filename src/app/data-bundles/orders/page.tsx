import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataOrderLookup } from "@/components/data/DataOrderLookup";
import { lookupOrders, maskPhone } from "@/lib/data-bundles/lookup";
import { formatPrice } from "@/lib/format";
import {
  DATA_STATUS_LABELS,
  DATA_STATUS_TONES,
  bundleLabel,
  isDataOrderStatus,
  networkLabel,
} from "@/lib/data-bundles/networks";

export const metadata: Metadata = { title: "Track a Data Order — NikiMart" };
export const dynamic = "force-dynamic";

function StatusPill({ status }: { status: string }) {
  const known = isDataOrderStatus(status) ? status : "processing";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DATA_STATUS_TONES[known]}`}>
      {DATA_STATUS_LABELS[known]}
    </span>
  );
}

export default async function DataOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; paid?: string; afa?: string; failed?: string }>;
}) {
  const params = await searchParams;
  const outcome = await lookupOrders(params.q);

  return (
    <>
      <PageHeader
        title="Track a data order"
        subtitle="Enter your reference or the phone number you paid with to see where your bundle is."
        crumbs={[{ label: "Data bundles", href: "/data-bundles" }, { label: "Track order" }]}
        tone="dark"
      />

      <Container className="py-8">
        <div className="mx-auto max-w-2xl">
          {params.paid ? (
            <p className="mb-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/30">
              Payment received. Your bundle is being sent now — this page updates as it progresses.
            </p>
          ) : null}
          {params.afa ? (
            <p className="mb-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/30">
              Payment received. Your AFA registration has been submitted for approval.
            </p>
          ) : null}
          {params.failed ? (
            <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 ring-1 ring-amber-200">
              We couldn&apos;t confirm that payment yet. If it left your wallet, it will settle
              shortly — check back here in a minute before paying again.
            </p>
          ) : null}

          <div className="rounded-3xl bg-white p-6 ring-1 ring-black/5 sm:p-8">
            <div className="mb-4 flex items-center gap-2">
              <PackageSearch className="h-5 w-5 text-niki-orange" />
              <h2 className="font-semibold text-niki-ink">Where&apos;s my data?</h2>
            </div>
            <DataOrderLookup defaultValue={params.q ?? ""} />

            {outcome.state === "error" ? (
              <p className="mt-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
                {outcome.message}
              </p>
            ) : null}

            {outcome.state === "empty" ? (
              <p className="mt-4 rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/60">
                No orders found for “{params.q}”. Check the reference, or search with the phone
                number you paid with.
              </p>
            ) : null}

            {outcome.state === "found" ? (
              <ul className="mt-5 space-y-3">
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

          <p className="mt-6 text-center text-sm text-niki-ink/60">
            Need another bundle?{" "}
            <Link href="/data-bundles" className="font-semibold text-niki-orange hover:underline">
              Back to the data store
            </Link>
          </p>
        </div>
      </Container>
    </>
  );
}
