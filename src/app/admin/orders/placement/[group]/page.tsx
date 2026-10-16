import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Layers,
  MapPin,
  Package,
  Phone,
  Truck,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceGroupForm, type PlaceParcel } from "@/components/admin/retail/PlaceGroupForm";
import { ActionLink } from "@/components/ui/motion";
import { formatPrice } from "@/lib/format";
import { requireDashboard } from "@/lib/session";
import { getQueueGroup, groupToken, type QueueGroup } from "@/lib/retail/placement";

export const metadata: Metadata = { title: "Place order — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One parcel, in full, with the button that buys it.
 *
 * The queue row says whether this is worth ordering. This window says what
 * ordering it actually means: which supplier, on which lane, into which Ghana
 * warehouse, covering which customers' lines — and which of those customers
 * has been waiting longest. Every line links back to the order it came from,
 * because the question an admin asks here is usually about a person rather
 * than a parcel.
 */
export default async function PlacementGroupPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  await requireDashboard("/admin");
  const { group: token } = await params;
  const { group, siblings } = await getQueueGroup(token);
  if (!group) notFound();

  const share = group.minCbm > 0 ? Math.min(1, group.totalCbm / group.minCbm) : 1;
  const ready = group.thresholdMet || group.scheduleDue;
  const now = new Date();
  const waitingDays = Math.max(
    0,
    Math.floor((now.getTime() - group.waitingSince.getTime()) / 86_400_000),
  );
  const orderNumbers = [...new Set(group.lines.map((l) => l.orderNumber))];

  const parcel = (g: QueueGroup): PlaceParcel => ({
    key: g.key,
    label: `${g.vendorName} · ${g.routeLabel}`,
    note: `${g.lines.length} line${g.lines.length === 1 ? "" : "s"} · ${g.forwarderName}`,
    cbm: g.totalCbm,
    value: g.goodsValue,
    units: g.totalUnits,
    itemIds: g.lines.map((l) => l.orderItemId),
  });

  return (
    <>
      <PageHeader
        title={group.supplierName}
        subtitle={`${group.lines.length} line${group.lines.length === 1 ? "" : "s"} from ${group.vendorName}, waiting ${waitingDays} day${waitingDays === 1 ? "" : "s"} on ${group.forwarderName}'s ${group.routeLabel}.`}
        crumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Order fulfilment", href: "/admin/orders" },
          { label: "Order placement", href: "/admin/orders/placement" },
          { label: group.supplierName },
        ]}
      >
        <Link
          href="/admin/orders/placement"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" /> Queue
        </Link>
      </PageHeader>

      <Container className="py-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-5">
            {/* The parcel, as the forwarder will see it. */}
            <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display font-bold text-niki-ink">The parcel</h2>
                  <p className="text-xs text-niki-ink/55">
                    One supplier, one lane — what will be shipped as a single consignment.
                  </p>
                </div>
                <span
                  className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                    group.thresholdMet
                      ? "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30"
                      : group.scheduleDue
                        ? "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/25"
                        : "bg-niki-gold/20 text-amber-900 ring-1 ring-niki-gold/30"
                  }`}
                >
                  {group.thresholdMet
                    ? "Ready — minimum reached"
                    : group.scheduleDue
                      ? "Due — scheduled order date"
                      : "Building volume"}
                </span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Figure label="Volume" value={`${group.totalCbm.toFixed(3)} m³`}>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-lg bg-niki-black/10">
                    <span
                      className={`block h-full rounded-lg ${ready ? "bg-niki-success" : "bg-niki-orange"}`}
                      style={{ width: `${Math.round(share * 100)}%` }}
                    />
                  </span>
                  <span className="mt-1 block text-[11px] text-niki-ink/45">
                    {group.minCbm > 0 ? `of ${group.minCbm} m³ minimum` : "no minimum on this lane"}
                  </span>
                </Figure>
                <Figure label="Goods value" value={formatPrice(group.goodsValue)}>
                  <span className="mt-1 block text-[11px] text-niki-ink/45">
                    {group.totalUnits} unit{group.totalUnits === 1 ? "" : "s"} at the prices the
                    buyers paid
                  </span>
                </Figure>
                <Figure label="Waiting since" value={group.waitingSince.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}>
                  <span className="mt-1 block text-[11px] text-niki-ink/45">
                    {waitingDays} day{waitingDays === 1 ? "" : "s"} · {orderNumbers.length} order
                    {orderNumbers.length === 1 ? "" : "s"}
                  </span>
                </Figure>
              </div>
            </section>

            {/* The lines — and the people behind them. */}
            <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <h2 className="font-display font-bold text-niki-ink">What has to be bought</h2>
              <p className="text-xs text-niki-ink/55">
                Every line is somebody&apos;s order. Open one to reach the buyer.
              </p>
              <div className="-mx-5 mt-4 overflow-x-auto px-5">
                <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-niki-surface/70">
                      <th className={`${th} rounded-l-xl`}>Product</th>
                      <th className={th}>Order</th>
                      <th className={th}>Buyer</th>
                      <th className={th}>Qty</th>
                      <th className={th}>Volume</th>
                      <th className={`${th} rounded-r-xl`}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.lines.map((l) => (
                      <tr
                        key={l.orderItemId}
                        className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                      >
                        <td className={td}>
                          <Link
                            href={`/admin/products/${l.productId}`}
                            className="block max-w-[14rem] truncate font-medium text-niki-ink hover:text-niki-orange"
                            title={l.productName}
                          >
                            {l.productName}
                          </Link>
                        </td>
                        <td className={`${td} font-mono text-xs text-niki-ink/70`}>
                          {l.orderNumber}
                        </td>
                        <td className={`${td} text-xs text-niki-ink/70`}>{l.buyerName}</td>
                        <td className={`${td} font-figures text-niki-ink/75`}>{l.quantity}</td>
                        <td className={`${td} font-figures text-xs text-niki-ink/60`}>
                          {l.cbm.toFixed(4)} m³
                        </td>
                        <td className={`${td} font-figures font-semibold text-niki-ink`}>
                          {formatPrice(l.unitPrice * l.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <PlaceGroupForm
              supplierName={group.supplierName}
              supplierUrl={group.supplierUrl}
              supplierContact={group.supplierContact}
              forwarderId={group.forwarderId ?? ""}
              forwarderName={group.forwarderName}
              routeId={group.routeId ?? ""}
              minCbm={group.minCbm}
              thresholdMet={group.thresholdMet}
              main={parcel(group)}
              siblings={siblings.map(parcel)}
            />
          </div>

          <aside className="h-fit space-y-4">
            <Card title="Supplier" icon={Package}>
              <p className="font-semibold text-niki-ink">{group.supplierName}</p>
              {group.supplierContact ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-niki-ink/60">
                  <Phone className="h-3.5 w-3.5" />
                  {group.supplierContact}
                </p>
              ) : null}
              {group.supplierUrl ? (
                <a
                  href={group.supplierUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="niki-press mt-3 inline-flex items-center gap-1.5 rounded-lg bg-niki-black px-4 py-2 text-xs font-semibold text-white hover:bg-niki-black/85"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open the listing
                </a>
              ) : (
                <p className="mt-2 text-xs text-niki-ink/45">
                  No supplier link on these listings — the seller has not recorded one.
                </p>
              )}
            </Card>

            <Card title="Freight" icon={Truck}>
              <Row label="Forwarder" value={group.forwarderName} />
              <Row label="Lane" value={group.routeLabel} />
              {group.modeLabel ? <Row label="Mode" value={group.modeLabel} /> : null}
              {group.destinationName ? (
                <Row label="Lands at" value={group.destinationName} />
              ) : null}
              <Row
                label="Minimum"
                value={group.minCbm > 0 ? `${group.minCbm} m³` : "None set"}
              />
              {group.forwarderId ? (
                <Link
                  href={`/admin/shipping/forwarders/${group.forwarderId}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-niki-trust hover:underline"
                >
                  The forwarder&apos;s rates
                </Link>
              ) : null}
            </Card>

            <Card title="Schedule" icon={CalendarClock}>
              <Row label="Ordering" value={group.schedule || "Not scheduled"} />
              <Row
                label="Next due"
                value={
                  group.dueAt
                    ? group.dueAt.toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"
                }
              />
              <p className="mt-2 text-xs text-niki-ink/50">
                A lane&apos;s ordering day is a reason to buy even under the minimum: the next
                sailing is otherwise a fortnight away.
              </p>
            </Card>

            {siblings.length > 0 ? (
              <Card title={`Also from ${group.supplierName}`} icon={Layers}>
                <ul className="space-y-2">
                  {siblings.map((s) => (
                    <li key={s.key}>
                      <ActionLink
                        href={`/admin/orders/placement/${groupToken(s.key)}`}
                        className="niki-focus block rounded-xl px-3 py-2 transition-colors hover:bg-niki-surface/70"
                      >
                        <span className="block text-sm font-medium text-niki-ink">
                          {s.vendorName} · {s.routeLabel}
                        </span>
                        <span className="block text-xs text-niki-ink/50">
                          {s.totalCbm.toFixed(3)} m³ · {formatPrice(s.goodsValue)} ·{" "}
                          {s.lines.length} line{s.lines.length === 1 ? "" : "s"}
                        </span>
                      </ActionLink>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-niki-ink/50">
                  Tick these in the form to buy them all under one reference.
                </p>
              </Card>
            ) : null}

            <Card title="Orders covered" icon={MapPin}>
              <ul className="flex flex-wrap gap-1.5">
                {orderNumbers.map((n) => (
                  <li key={n}>
                    <Link
                      href={`/admin/orders?q=${encodeURIComponent(n)}`}
                      className="inline-flex rounded-lg bg-niki-surface px-2.5 py-1 font-mono text-[11px] font-semibold text-niki-ink/70 transition-colors hover:bg-niki-black hover:text-white"
                    >
                      {n}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      </Container>
    </>
  );
}

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3 align-middle";

function Figure({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">{label}</p>
      <p className="mt-1 font-figures text-xl font-bold text-niki-ink">{value}</p>
      {children}
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="mb-3 flex items-center gap-2 text-niki-ink">
        <Icon className="h-4 w-4 text-niki-orange" />
        <h2 className="font-display text-sm font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-niki-edge py-2 last:border-0">
      <span className="text-xs text-niki-ink/55">{label}</span>
      <span className="text-right text-sm font-medium text-niki-ink">{value}</span>
    </div>
  );
}
