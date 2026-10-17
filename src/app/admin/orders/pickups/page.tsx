import type { Metadata } from "next";
import { Suspense } from "react";
import {
  AlertTriangle,
  Clock,
  KeyRound,
  Lock,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { FulfilmentTabs } from "@/components/admin/retail/FulfilmentTabs";
import { StatTile } from "@/components/admin/retail/StatTile";
import { TableFilters } from "@/components/admin/TableFilters";
import { OrderRowActions } from "@/components/admin/retail/OrderRowActions";
import { SendCodeButton } from "@/components/pickup/SendCodeButton";
import { OrderPager } from "@/components/data/OrderPager";
import { ActionLink } from "@/components/ui/motion";
import { formatPrice } from "@/lib/format";
import { normalizeGhPhone } from "@/lib/phone";
import { requireDashboard } from "@/lib/session";
import { perPageFrom } from "@/lib/retail/orders";
import {
  OVERDUE_DAYS,
  PICKUP_FILTER_OPTIONS,
  getPickupBoard,
  pickupFilter,
} from "@/lib/retail/pickups";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Pickups — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

/**
 * Every parcel going over a counter, across every point.
 *
 * The pickup network was run from inside each point's own dashboard, which
 * meant the questions that cost money had nowhere to be asked: what has sat
 * uncollected for a fortnight, which counter is holding it, how much cash is
 * still to be taken on arrival, and — since parcels are now released against
 * a code — which ones went out without one.
 *
 * That last column is the reason this screen is not just a filtered view of
 * the order book. An override is a parcel handed over on somebody's word, and
 * one or two a month is normal while a dozen is a conversation.
 */
export default async function AdminPickupsPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    point?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const filter = pickupFilter(params.filter);
  const point = (params.point ?? "all").trim();
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total, counts, summary, points } = await getPickupBoard({
    filter,
    point,
    query,
    page,
    perPage,
  });
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  const filterOptions = PICKUP_FILTER_OPTIONS.map((o) =>
    counts[o.value] ? { ...o, label: `${o.label} (${counts[o.value]})` } : { ...o },
  );

  return (
    <>
      <PageHeader
        title="Order fulfilment"
        subtitle="Every order placed on the mall, who placed it, what is still owed on it, and what has to happen next."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Order fulfilment" }]}
      />

      <Container className="space-y-4 py-6 sm:space-y-5 sm:py-8">
        <FulfilmentTabs counts={{ "/admin/orders/pickups": summary.awaiting }} />

        <section className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-6">
          <StatTile
            label="Awaiting collection"
            value={String(summary.awaiting)}
            hint="Still on a shelf"
            href="/admin/orders/pickups?filter=awaiting"
            icon={PackageCheck}
            tone={summary.awaiting > 0 ? "orange" : "ink"}
          />
          <StatTile
            label="Ready, code sent"
            value={String(summary.readyWithCode)}
            hint="Buyer can walk in today"
            href="/admin/orders/pickups?filter=ready"
            icon={KeyRound}
            tone="success"
          />
          <StatTile
            label={`Over ${OVERDUE_DAYS} days`}
            value={String(summary.overdue)}
            hint="Waiting too long — chase"
            href="/admin/orders/pickups?filter=overdue"
            icon={AlertTriangle}
            tone={summary.overdue > 0 ? "danger" : "ink"}
          />
          <StatTile
            label="Code locked"
            value={String(summary.locked)}
            hint="Too many wrong tries"
            href="/admin/orders/pickups?filter=locked"
            icon={Lock}
            tone={summary.locked > 0 ? "danger" : "ink"}
          />
          <StatTile
            label="Released no code"
            value={String(summary.overrides)}
            hint="Handed over on an override"
            href="/admin/orders/pickups?filter=override"
            icon={ShieldCheck}
            tone={summary.overrides > 0 ? "orange" : "ink"}
          />
          <StatTile
            label="Due at the counter"
            value={formatPrice(summary.balanceAtCounter)}
            hint="Cash still to be taken"
            href="/admin/orders?payment=part&method=pickup"
            icon={Wallet}
            tone={summary.balanceAtCounter > 0 ? "orange" : "ink"}
          />
        </section>

        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={query}
            searchPlaceholder="Search by order number, buyer, phone, who collected…"
            searchLabel="Search pickups"
            noun="pickups"
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            filters={[
              { key: "filter", label: "Filter by state", value: filter, options: filterOptions },
              {
                key: "point",
                label: "Filter by pickup point",
                value: point,
                options: [
                  { value: "all", label: "Every pickup point" },
                  ...points.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` })),
                ],
              },
            ]}
          />
        </Suspense>

        {rows.length === 0 ? (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/50 ring-1 ring-niki-edge">
            No pickups match these filters.
          </p>
        ) : (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-niki-surface/70">
                    <th className={`${th} rounded-l-xl`}>Order ID</th>
                    <th className={th}>Buyer</th>
                    <th className={th}>Pickup point</th>
                    <th className={th}>Ready</th>
                    <th className={th}>Waiting</th>
                    <th className={th}>Verification</th>
                    <th className={th}>Collected by</th>
                    <th className={th}>Due</th>
                    <th className={`${th} rounded-r-xl`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const wa = normalizeGhPhone(r.buyerPhone);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                      >
                        <td className={td}>
                          <ActionLink
                            href={`/admin/orders/${r.id}`}
                            className="font-mono text-xs font-semibold text-niki-ink hover:text-niki-orange"
                          >
                            {r.orderNumber}
                          </ActionLink>
                        </td>

                        <td className={td}>
                          <p className="font-medium text-niki-ink">{r.buyerName}</p>
                          <p className="text-xs text-niki-ink/50">{r.buyerPhoneMasked}</p>
                        </td>

                        <td className={td}>
                          <span className="flex items-center gap-1.5 text-xs text-niki-ink/70">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-niki-ink/35" />
                            {r.pointName}
                          </span>
                        </td>

                        <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
                          {r.readyAt
                            ? r.readyAt.toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "Not yet"}
                        </td>

                        <td className={td}>
                          {r.collectedAt ? (
                            <span className="text-xs text-niki-ink/40">—</span>
                          ) : r.waitingDays === null ? (
                            <span className="text-xs text-niki-ink/40">—</span>
                          ) : (
                            <span
                              className={cn(
                                "flex items-center gap-1 whitespace-nowrap font-figures text-xs font-semibold",
                                r.overdue ? "text-niki-danger" : "text-niki-ink/70",
                              )}
                            >
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              {r.waitingDays} day{r.waitingDays === 1 ? "" : "s"}
                            </span>
                          )}
                        </td>

                        <td className={td}>
                          <VerificationPill row={r} />
                        </td>

                        <td className={td}>
                          {r.collection?.collectedAt ? (
                            <>
                              <p className="text-xs font-medium text-niki-ink">
                                {r.collection.collectorName}
                              </p>
                              <p className="text-[11px] text-niki-ink/50">
                                {r.collection.collectorRelation === "buyer"
                                  ? "The buyer"
                                  : r.collection.collectorRelation}
                                {r.collection.collectorIdNumber
                                  ? ` · ${r.collection.collectorIdType} ${r.collection.collectorIdNumber}`
                                  : ""}
                              </p>
                              {r.collection.releasedByName ? (
                                <p className="text-[11px] text-niki-ink/40">
                                  Released by {r.collection.releasedByName}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-niki-ink/35">—</span>
                          )}
                        </td>

                        <td className={td}>
                          {r.balanceDue > 0 ? (
                            <span className="font-figures font-semibold text-niki-orange">
                              {formatPrice(r.balanceDue)}
                            </span>
                          ) : (
                            <span className="text-niki-ink/35">—</span>
                          )}
                        </td>

                        <td className={td}>
                          <div className="flex flex-col items-end gap-1.5">
                            <OrderRowActions
                              href={`/admin/orders/${r.id}`}
                              orderNumber={r.orderNumber}
                              phone={r.buyerPhone || undefined}
                              whatsapp={wa ?? undefined}
                            />
                            {/* The one thing worth doing from a desk: a buyer
                                who lost the text. Releasing still happens at
                                the counter, where somebody can see who is
                                asking. */}
                            {r.collectedAt ? null : (
                              <SendCodeButton
                                orderId={r.id}
                                again={Boolean(r.collection?.hasLiveCode)}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Suspense fallback={<div className="h-12" />}>
              <OrderPager page={page} pageCount={pageCount} perPage={perPage} />
            </Suspense>
          </div>
        )}

        <p className="flex items-start gap-2 rounded-2xl bg-white px-5 py-4 text-xs text-niki-ink/55 ring-1 ring-niki-edge">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-niki-orange" />
          <span>
            A parcel is released at the counter against a one-time code texted to the buyer, and
            whoever takes it is recorded by name, number and ID. An administrator can release one
            without a code, which asks for a written reason and shows here as{" "}
            <span className="font-semibold text-amber-700">No code</span>.
          </span>
        </p>
      </Container>
    </>
  );
}

function VerificationPill({
  row,
}: {
  row: {
    collectedAt: Date | null;
    collection: {
      method: string;
      hasLiveCode: boolean;
      locked: boolean;
      attemptsLeft: number;
      codeSentAt: Date | null;
    } | null;
  };
}) {
  const base = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase";

  if (row.collectedAt) {
    return row.collection?.method === "override" ? (
      <span className={`${base} bg-amber-100 text-amber-800`}>
        <ShieldCheck className="h-3 w-3" />
        No code
      </span>
    ) : (
      <span className={`${base} bg-niki-success/10 text-niki-success`}>
        <ShieldCheck className="h-3 w-3" />
        Code verified
      </span>
    );
  }
  if (row.collection?.locked) {
    return (
      <span className={`${base} bg-niki-danger/10 text-niki-danger`}>
        <Lock className="h-3 w-3" />
        Locked
      </span>
    );
  }
  if (row.collection?.hasLiveCode) {
    return (
      <span className={`${base} bg-niki-trust/10 text-niki-trust`}>
        <KeyRound className="h-3 w-3" />
        Code sent
      </span>
    );
  }
  return <span className={`${base} bg-niki-ink/10 text-niki-ink/50`}>No code yet</span>;
}
