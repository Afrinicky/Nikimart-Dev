import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Check,
  Clock,
  ExternalLink,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Store,
  Wallet,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { PayoutForm } from "@/components/admin/PayoutForm";
import { ActionLink } from "@/components/ui/motion";
import { requireDashboard } from "@/lib/session";
import { formatPrice } from "@/lib/format";
import { normalizeGhPhone } from "@/lib/phone";
import { createSellerPayout, markPayoutPaid, rejectPayoutRequest } from "@/lib/finance-actions";
import {
  getSettlement,
  SETTLEMENT_LABELS,
  SETTLEMENT_TONES,
  type SettlementState,
} from "@/lib/retail/settlements";

export const metadata: Metadata = { title: "Settle seller — Finance — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Settling one shop.
 *
 * Everything the decision needs on one screen: what they sold, what Nickimart
 * kept, what is still held against undelivered orders, what has cleared, and
 * what has already gone — next to the number the money would go to and a way
 * to reach the person it belongs to.
 *
 * The form refuses an amount above what has cleared, which is the one rule
 * that matters: paying out of escrow is paying for an order that can still be
 * cancelled.
 */
export default async function SettleSellerPage({
  params,
  searchParams,
}: {
  params: Promise<{ vendorId: string }>;
  searchParams?: Promise<{ paid?: string }>;
}) {
  await requireDashboard("/admin");
  const { vendorId } = await params;
  const justPaid = (await searchParams)?.paid === "1";

  const data = await getSettlement(vendorId);
  if (!data) notFound();

  const { vendor, earnings, payouts, products, payout } = data;
  const pending = payouts.filter((p) => p.status === "pending");
  const settled = payouts.filter((p) => p.status !== "pending");
  const wa = normalizeGhPhone(vendor.whatsapp || vendor.owner?.phone);

  const state: SettlementState =
    pending.length > 0
      ? "requested"
      : earnings.available > 0
        ? payout.target
          ? "payable"
          : "nodetails"
        : earnings.inEscrow > 0
          ? "holding"
          : "settled";

  const day = (d: Date | null) =>
    d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <>
      <PageHeader
        title={vendor.businessName}
        subtitle={`${products} listing${products === 1 ? "" : "s"} · ${
          vendor.owner?.name ?? vendor.owner?.email ?? "no owner linked"
        }`}
        crumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Finance", href: "/admin/finance" },
          { label: "Seller settlements", href: "/admin/finance/settlements" },
          { label: vendor.businessName },
        ]}
      >
        <Link
          href="/admin/finance/settlements"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" /> Settlements
        </Link>
      </PageHeader>

      <Container className="py-6 sm:py-8">
        {justPaid ? (
          <p className="animate-fade-up mb-5 flex items-center gap-2 rounded-2xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/30">
            <Check className="h-4 w-4" />
            Payment recorded. The shop sees it on their settlements screen.
          </p>
        ) : null}

        {/* The position. */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${SETTLEMENT_TONES[state]}`}
            >
              {SETTLEMENT_LABELS[state]}
            </span>
            <span className="rounded-full bg-niki-ink/5 px-2.5 py-1 text-[11px] font-semibold text-niki-ink/60">
              {vendor.verificationStatus === "verified" ? "Verified shop" : "Unverified shop"}
            </span>
            {payouts.length > 0 ? (
              <span className="rounded-full bg-niki-ink/5 px-2.5 py-1 text-[11px] font-semibold text-niki-ink/60">
                {settled.length} payment{settled.length === 1 ? "" : "s"} made
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
            <Figure label="Sold" value={formatPrice(earnings.gross)} note="Gross, excluding cancelled" />
            <Figure label="Commission" value={formatPrice(earnings.commission)} note="What Nickimart kept" />
            <Figure
              label="Affiliate"
              value={formatPrice(earnings.affiliateCost)}
              note="Funded by this shop"
            />
            <Figure
              label="Held"
              value={formatPrice(earnings.inEscrow)}
              note="Until the buyer has it"
              tone={earnings.inEscrow > 0 ? "trust" : "ink"}
            />
            <Figure label="Paid out" value={formatPrice(earnings.paidOut)} note="Already sent" tone="success" />
            <Figure
              label="Payable"
              value={formatPrice(earnings.available)}
              note="Cleared and unpaid"
              tone={earnings.available > 0 ? "orange" : "ink"}
            />
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-5">
            {/* A request the seller raised. Deciding it is the first thing to do. */}
            {pending.length > 0 ? (
              <section className="rounded-2xl bg-niki-gold/10 p-4 ring-1 ring-niki-gold/30 sm:p-5">
                <div className="flex items-center gap-2 text-niki-ink">
                  <Clock className="h-4 w-4 text-amber-700" />
                  <h2 className="font-display font-bold">
                    {pending.length === 1 ? "A payout was requested" : "Payouts were requested"}
                  </h2>
                </div>
                <ul className="mt-3 space-y-2">
                  {pending.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-niki-edge"
                    >
                      <div className="min-w-0">
                        <p className="font-figures font-bold text-niki-ink">
                          {formatPrice(p.amount)}
                        </p>
                        <p className="mt-0.5 text-xs text-niki-ink/55">
                          {p.method || "No method given"} · asked {day(p.createdAt)}
                          {p.note ? ` · ${p.note.replace("Requested by seller — ", "")}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <form action={markPayoutPaid}>
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            type="submit"
                            className="niki-press niki-focus rounded-full bg-niki-success px-4 py-2 text-xs font-semibold text-white"
                          >
                            Mark paid
                          </button>
                        </form>
                        <form action={rejectPayoutRequest}>
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            type="submit"
                            className="niki-press niki-focus rounded-full px-3 py-2 text-xs font-semibold text-niki-danger hover:bg-niki-danger/10"
                          >
                            Turn down
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-amber-900/70">
                  Send the money first, then mark it paid. Turning a request down puts the amount
                  straight back into what is payable.
                </p>
              </section>
            ) : null}

            {/* Paying them. */}
            <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
              <div className="flex items-center gap-2 text-niki-ink">
                <Banknote className="h-4 w-4 text-niki-orange" />
                <h2 className="font-display font-bold">Record a payment</h2>
              </div>

              {!payout.target ? (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  This shop has not filled in its payout details, so there is nowhere to send the
                  money. Ask them to add a MoMo number or bank account in their shop settings.
                </p>
              ) : null}

              {earnings.available <= 0 ? (
                <p className="mt-3 rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/60">
                  {earnings.inEscrow > 0
                    ? `Nothing has cleared yet — ${formatPrice(earnings.inEscrow)} is held against orders the buyers do not have. It becomes payable on delivery.`
                    : "Nothing is owed to this shop."}
                </p>
              ) : (
                <div className="mt-4">
                  <p className="mb-4 text-sm text-niki-ink/60">
                    Send {formatPrice(earnings.available)} to{" "}
                    <span className="font-semibold text-niki-ink">
                      {payout.target || "— no details on file —"}
                    </span>
                    {payout.name ? ` (${payout.name})` : ""}, then record it here.
                  </p>
                  <PayoutForm
                    action={createSellerPayout}
                    hiddenName="vendorId"
                    hiddenValue={vendor.id}
                    defaultAmount={earnings.available}
                    cancelHref="/admin/finance/settlements"
                    submitLabel="Record the payment"
                  />
                </div>
              )}
            </section>

            {/* What has already gone. */}
            <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
              <h2 className="font-display font-bold text-niki-ink">Payment history</h2>
              {settled.length === 0 ? (
                <p className="mt-2 text-sm text-niki-ink/55">
                  Nothing has been paid to this shop yet.
                </p>
              ) : (
                <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                  <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="bg-niki-surface/70">
                        <th className={`${th} rounded-l-xl`}>Paid</th>
                        <th className={th}>Method</th>
                        <th className={th}>Reference</th>
                        <th className={`${th} rounded-r-xl text-right`}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settled.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                        >
                          <td className={`${td} whitespace-nowrap text-xs text-niki-ink/70`}>
                            {day(p.paidAt ?? p.createdAt)}
                          </td>
                          <td className={`${td} text-xs text-niki-ink/70`}>{p.method || "—"}</td>
                          <td className={`${td} font-mono text-[11px] text-niki-ink/60`}>
                            {p.reference || "—"}
                          </td>
                          <td className={`${td} text-right font-figures font-semibold text-niki-ink`}>
                            {formatPrice(p.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <aside className="h-fit space-y-4">
            <Card title="Where the money goes" icon={Wallet}>
              {payout.target ? (
                <>
                  <Row label="Method" value={payout.method} />
                  <Row label="Number" value={payout.target} />
                  {payout.name ? <Row label="Name" value={payout.name} /> : null}
                </>
              ) : (
                <p className="text-xs text-niki-ink/55">
                  Nothing on file. The shop sets this in their own settings — an admin cannot type
                  somebody else&apos;s account number for them.
                </p>
              )}
            </Card>

            <Card title="The shop" icon={Store}>
              <Row label="Owner" value={vendor.owner?.name ?? vendor.owner?.email ?? "—"} />
              {vendor.owner?.phone ? <Row label="Phone" value={vendor.owner.phone} /> : null}
              <Row label="Listings" value={String(products)} />
              <div className="mt-3 flex flex-wrap gap-2">
                {wa ? (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="niki-press flex items-center gap-1.5 rounded-lg bg-niki-success/10 px-3 py-1.5 text-xs font-semibold text-niki-success"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                ) : null}
                {vendor.owner?.phone ? (
                  <a
                    href={`tel:${vendor.owner.phone}`}
                    className="niki-press flex items-center gap-1.5 rounded-lg bg-niki-black/5 px-3 py-1.5 text-xs font-semibold text-niki-ink/70"
                  >
                    <Phone className="h-3.5 w-3.5" /> Call
                  </a>
                ) : null}
                {vendor.owner?.email ? (
                  <a
                    href={`mailto:${vendor.owner.email}`}
                    className="niki-press flex items-center gap-1.5 rounded-lg bg-niki-black/5 px-3 py-1.5 text-xs font-semibold text-niki-ink/70"
                  >
                    <Mail className="h-3.5 w-3.5" /> Email
                  </a>
                ) : null}
              </div>
            </Card>

            <Card title="Elsewhere" icon={Package}>
              <ul className="space-y-1.5 text-sm">
                <LinkRow href={`/admin/vendors/${vendor.id}`} label="The shop's record" />
                <LinkRow href={`/shops/${vendor.slug}`} label="The shop as buyers see it" external />
                <LinkRow
                  href={`/admin/finance/orders?q=${encodeURIComponent(vendor.businessName)}`}
                  label="What its orders earned"
                />
                <LinkRow href="/admin/finance/breakdown/owed" label="Everything owed to sellers" />
              </ul>
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
  tone?: "ink" | "success" | "orange" | "trust";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    orange: "text-niki-orange",
    trust: "text-niki-trust",
  } as const;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45">{label}</p>
      <p className={`mt-1 font-figures text-base font-bold sm:text-lg ${tones[tone]}`}>{value}</p>
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

function LinkRow({ href, label, external }: { href: string; label: string; external?: boolean }) {
  return (
    <li>
      <ActionLink
        href={href}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-niki-ink/70 transition-colors hover:bg-niki-surface hover:text-niki-ink"
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-niki-ink/40" />
        <span className="text-xs font-medium">{label}</span>
        {external ? <span className="sr-only">(opens the storefront)</span> : null}
      </ActionLink>
    </li>
  );
}
