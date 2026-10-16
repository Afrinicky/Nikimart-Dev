import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  ExternalLink,
  FileText,
  Package,
  Phone,
  Truck,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActionLink } from "@/components/ui/motion";
import { PurchaseRecordForm } from "@/components/admin/retail/PurchaseRecordForm";
import { SupplierPayments, type PaymentRow } from "@/components/admin/retail/SupplierPayments";
import { PurchaseDispute } from "@/components/admin/retail/PurchaseDispute";
import { requireDashboard } from "@/lib/session";
import { formatMoney, formatPrice } from "@/lib/format";
import { freightModeLabel } from "@/lib/shipping";
import { PURCHASE_STATUS_LABELS } from "@/lib/purchasing";
import {
  disputeLabel,
  getPurchase,
  parseDocuments,
  purchaseMoney,
} from "@/lib/retail/purchase";

export const metadata: Metadata = { title: "Purchase — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One purchase, in full.
 *
 * The screen that did not exist, and the reason the whole procurement record
 * was thin: there was nowhere to put any of it. A purchase was a reference in
 * a table and a total in cedis, which is enough to say that money left and
 * nothing like enough to get it back.
 *
 * So: what the supplier agreed to, what has actually been paid and through
 * which channel, where the invoice and the receipts live, what the supplier
 * promised and when, which customer orders are riding on it — and, when it
 * goes wrong, a place to say so that the console can count.
 */
export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireDashboard("/admin");
  const { id } = await params;

  const purchase = await getPurchase(id);
  if (!purchase) notFound();

  const now = new Date();
  const money = purchaseMoney(purchase);
  const docs = parseDocuments(purchase.documents);
  const orders = [
    ...new Map(purchase.items.map((i) => [i.order.id, i.order])).values(),
  ];
  const units = purchase.items.reduce((s, i) => s + i.quantity, 0);
  const day = (d: Date | null) =>
    d
      ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      : "";

  const payments: PaymentRow[] = purchase.payments.map((p) => ({
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    amountGhs: p.amountGhs,
    method: p.method,
    kind: p.kind,
    reference: p.reference,
    receiptUrl: p.receiptUrl,
    note: p.note,
    paidAt: day(p.paidAt),
    recordedBy: p.recordedBy?.name ?? p.recordedBy?.email ?? "",
  }));

  // Late against what the supplier promised, and still not with the forwarder.
  const overdue =
    purchase.expectedAt !== null &&
    purchase.status === "placed" &&
    purchase.expectedAt.getTime() < now.getTime();

  return (
    <>
      <PageHeader
        title={purchase.reference}
        subtitle={`${purchase.supplierName || "Supplier"} · ${purchase.items.length} line${
          purchase.items.length === 1 ? "" : "s"
        } across ${orders.length} order${orders.length === 1 ? "" : "s"}`}
        crumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Order fulfilment", href: "/admin/orders" },
          { label: "Order placement", href: "/admin/orders/placement" },
          { label: purchase.reference },
        ]}
      >
        <Link
          href="/admin/orders/placement"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" /> Placement
        </Link>
      </PageHeader>

      <Container className="py-6 sm:py-8">
        {/* The money, first — it is what the record exists for. */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                purchase.status === "received"
                  ? "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30"
                  : purchase.status === "cancelled"
                    ? "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/25"
                    : "bg-niki-orange/10 text-niki-orange ring-1 ring-niki-orange/25"
              }`}
            >
              {PURCHASE_STATUS_LABELS[purchase.status] ?? purchase.status}
            </span>
            {purchase.disputeStatus !== "none" ? (
              <span className="inline-flex whitespace-nowrap rounded-full bg-niki-danger/10 px-2.5 py-1 text-[11px] font-semibold text-niki-danger ring-1 ring-niki-danger/25">
                {disputeLabel(purchase.disputeStatus)}
              </span>
            ) : null}
            {overdue ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                <AlertTriangle className="h-3 w-3" />
                Past the date the supplier gave
              </span>
            ) : null}
            {purchase.supplierOrderNo ? (
              <span className="rounded-full bg-niki-ink/5 px-2.5 py-1 font-mono text-[11px] font-semibold text-niki-ink/60">
                {purchase.supplierOrderNo}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Figure label="Agreed" value={formatMoney(money.agreed)} note={
              purchase.supplierCost > 0 && purchase.currency
                ? `${purchase.supplierCost.toLocaleString("en-GB")} ${purchase.currency}`
                : "At the prices the buyers paid"
            } />
            <Figure label="Paid" value={formatMoney(money.paid)} note={`${payments.length} payment${payments.length === 1 ? "" : "s"}`} tone="success" />
            <Figure
              label={money.overpaid ? "Overpaid" : "Still owed"}
              value={formatMoney(money.overpaid ? money.paid - money.agreed : money.outstanding)}
              note={money.outstanding > 0 ? "To the supplier" : "Settled"}
              tone={money.outstanding > 0 || money.overpaid ? "orange" : "ink"}
            />
            <Figure
              label="At risk"
              value={formatPrice(money.atRisk)}
              note={`${units} unit${units === 1 ? "" : "s"} the buyers paid for`}
              tone={purchase.disputeStatus === "raised" ? "danger" : "ink"}
            />
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-5">
            <SupplierPayments
              purchaseId={purchase.id}
              currency={purchase.currency}
              fxRate={purchase.fxRate}
              payments={payments}
              outstanding={money.outstanding}
            />

            <PurchaseRecordForm
              values={{
                id: purchase.id,
                supplierName: purchase.supplierName,
                supplierContact: purchase.supplierContact,
                supplierOrderNo: purchase.supplierOrderNo,
                currency: purchase.currency,
                fxRate: purchase.fxRate,
                supplierCost: purchase.supplierCost,
                invoiceUrl: purchase.invoiceUrl,
                receiptUrl: purchase.receiptUrl,
                agreementUrl: purchase.agreementUrl,
                documents: purchase.documents,
                supplierTracking: purchase.supplierTracking,
                supplierCarrier: purchase.supplierCarrier,
                expectedAt: purchase.expectedAt
                  ? purchase.expectedAt.toISOString().slice(0, 10)
                  : "",
                note: purchase.note,
              }}
            />

            {/* Who is waiting on it. */}
            <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
              <h2 className="font-display font-bold text-niki-ink">What it covers</h2>
              <p className="text-xs text-niki-ink/55">
                Every line is somebody&apos;s order. If this purchase fails, these are the buyers
                who have to be told.
              </p>
              <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-niki-surface/70">
                      <th className={`${th} rounded-l-xl`}>Product</th>
                      <th className={th}>Order</th>
                      <th className={th}>Buyer</th>
                      <th className={th}>Qty</th>
                      <th className={`${th} rounded-r-xl`}>Sold for</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchase.items.map((it) => (
                      <tr
                        key={it.id}
                        className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                      >
                        <td className={td}>
                          <Link
                            href={`/admin/products/${it.productId}`}
                            className="block max-w-[13rem] truncate font-medium text-niki-ink hover:text-niki-orange"
                            title={it.product.name}
                          >
                            {it.product.emoji ? `${it.product.emoji} ` : ""}
                            {it.product.name}
                          </Link>
                        </td>
                        <td className={td}>
                          <ActionLink
                            href={`/admin/orders/${it.order.id}`}
                            className="font-mono text-[11px] font-semibold text-niki-trust hover:underline"
                          >
                            {it.order.orderNumber}
                          </ActionLink>
                        </td>
                        <td className={`${td} text-xs text-niki-ink/70`}>
                          {it.order.user.name ?? it.order.user.email}
                        </td>
                        <td className={`${td} font-figures text-niki-ink/75`}>{it.quantity}</td>
                        <td className={`${td} font-figures font-semibold text-niki-ink`}>
                          {formatPrice(it.unitPrice * it.quantity)}
                        </td>
                      </tr>
                    ))}
                    {purchase.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={`${td} text-center text-xs text-niki-ink/50`}>
                          This purchase was cancelled, so its lines went back to the queue.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="h-fit space-y-4">
            <PurchaseDispute
              id={purchase.id}
              status={purchase.disputeStatus}
              note={purchase.disputeNote}
              raisedAt={day(purchase.disputeAt)}
            />

            <Card title="The paperwork" icon={FileText}>
              <ul className="space-y-1.5">
                <DocLink label="Invoice" url={purchase.invoiceUrl} />
                <DocLink label="Receipt" url={purchase.receiptUrl} />
                <DocLink label="Agreement" url={purchase.agreementUrl} />
                {docs.map((d) => (
                  <DocLink key={d.url} label={d.label} url={d.url} />
                ))}
              </ul>
              {!purchase.invoiceUrl &&
              !purchase.receiptUrl &&
              !purchase.agreementUrl &&
              docs.length === 0 ? (
                <p className="text-xs text-niki-ink/50">
                  Nothing linked yet. Paste the invoice and the chat where the terms were agreed —
                  that is the claim if the goods never come.
                </p>
              ) : null}
            </Card>

            <Card title="Supplier" icon={Package}>
              <Row label="Name" value={purchase.supplierName || "—"} />
              {purchase.supplierContact ? (
                <Row label="Contact" value={purchase.supplierContact} />
              ) : null}
              {purchase.supplierTracking ? (
                <Row
                  label="Their tracking"
                  value={`${purchase.supplierTracking}${purchase.supplierCarrier ? ` · ${purchase.supplierCarrier}` : ""}`}
                />
              ) : null}
              {purchase.expectedAt ? (
                <Row label="Promised by" value={day(purchase.expectedAt)} />
              ) : null}
              {purchase.supplierUrl ? (
                <a
                  href={purchase.supplierUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="niki-press mt-3 inline-flex items-center gap-1.5 rounded-lg bg-niki-black px-4 py-2 text-xs font-semibold text-white hover:bg-niki-black/85"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open the listing
                </a>
              ) : null}
            </Card>

            <Card title="Freight" icon={Truck}>
              <Row label="Forwarder" value={purchase.forwarder?.name ?? "—"} />
              <Row
                label="Lane"
                value={
                  purchase.route
                    ? purchase.route.name || freightModeLabel(purchase.route.mode)
                    : "Across lanes"
                }
              />
              <Row label="Volume" value={`${purchase.totalCbm.toFixed(3)} m³`} />
              <Row label="Shop" value={purchase.vendor?.businessName ?? "—"} />
              {purchase.forwarder?.contactPhone ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-niki-ink/55">
                  <Phone className="h-3.5 w-3.5" />
                  {purchase.forwarder.contactPhone}
                </p>
              ) : null}
              {purchase.forwarder ? (
                <Link
                  href={`/admin/shipping/forwarders/${purchase.forwarder.id}`}
                  className="mt-2 inline-flex text-xs font-semibold text-niki-trust hover:underline"
                >
                  The forwarder&apos;s rates
                </Link>
              ) : null}
            </Card>

            <Card title="Placed" icon={Banknote}>
              <Row label="When" value={day(purchase.placedAt) || "—"} />
              <Row
                label="By"
                value={purchase.placedBy?.name ?? purchase.placedBy?.email ?? "—"}
              />
              <Row label="Recorded" value={day(purchase.createdAt)} />
            </Card>
          </aside>
        </div>
      </Container>
    </>
  );
}

const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-3 py-3 align-middle";

function Figure({
  label,
  value,
  note,
  tone = "ink",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "ink" | "success" | "orange" | "danger";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    orange: "text-niki-orange",
    danger: "text-niki-danger",
  } as const;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45">{label}</p>
      <p className={`mt-1 font-figures text-lg font-bold sm:text-xl ${tones[tone]}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-niki-ink/45">{note}</p>
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
    <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
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

function DocLink({ label, url }: { label: string; url: string }) {
  if (!url) return null;
  return (
    <li>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-niki-ink/70 transition-colors hover:bg-niki-surface hover:text-niki-ink"
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-niki-ink/40" />
        <span className="truncate text-xs font-medium">{label}</span>
      </a>
    </li>
  );
}
