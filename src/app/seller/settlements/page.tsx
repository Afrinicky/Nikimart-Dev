import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSellerVendor, getSellerEarnings } from "@/lib/seller";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Earnings & Payouts — Seller — NikiMart" };

export default async function SellerSettlementsPage() {
  const user = await requireDashboard("/seller");
  const vendor = await getSellerVendor(user.id);

  if (!vendor) {
    return (
      <>
        <PageHeader title="Earnings & Payouts" crumbs={[{ label: "Seller", href: "/seller" }, { label: "Earnings" }]} />
        <Container className="py-8">
          <div className="rounded-2xl bg-niki-navy p-6 text-sm text-white/80">
            Register your shop first to start earning.{" "}
            <Link href="/vendor-register" className="font-semibold text-niki-orange hover:underline">
              Register a shop
            </Link>
          </div>
        </Container>
      </>
    );
  }

  const [earnings, payouts] = await Promise.all([
    getSellerEarnings(vendor.id),
    prisma.payout.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Earnings & Payouts"
        subtitle="Your sales, platform commission, and settlement history."
        crumbs={[{ label: "Seller", href: "/seller" }, { label: "Earnings" }]}
      >
        <Link href="/seller" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 hover:bg-white">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </PageHeader>

      <Container className="py-8">
        {/* Headline balance */}
        <div className="rounded-3xl bg-niki-navy p-6 text-white sm:p-8">
          <div className="flex items-center gap-2 text-white/70">
            <Wallet className="h-5 w-5 text-niki-orange" />
            <span className="text-sm font-medium">Available for payout</span>
          </div>
          <p className="mt-2 font-display text-4xl font-bold">{formatPrice(earnings.available)}</p>
          <p className="mt-2 max-w-lg text-sm text-white/60">
            Cleared earnings from delivered orders, minus anything already paid out or being processed.
            Payouts are issued by NikiMart from the Finance console.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Gross sales" value={formatPrice(earnings.gross)} />
          <StatCard label="Commission" value={formatPrice(earnings.commission)} />
          <StatCard label="In escrow" value={formatPrice(earnings.inEscrow)} />
          <StatCard label="Paid out" value={formatPrice(earnings.paidOut)} />
        </div>

        <div className="mt-4 rounded-2xl bg-white p-5 text-sm text-niki-ink/70 ring-1 ring-black/5">
          <p>
            <span className="font-semibold text-niki-ink">How settlements work:</span> when a buyer pays, your
            share (sale price minus commission) is held <span className="font-medium">in escrow</span>. Once the
            order is <span className="font-medium">delivered</span>, it clears and becomes available for payout.
            NikiMart&apos;s commission is deducted automatically per item.
          </p>
        </div>

        <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">Payout history</h2>
        {payouts.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-black/5">
            No payouts yet. When NikiMart settles your cleared earnings, they&apos;ll appear here.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/50">
                <tr>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Method</th>
                  <th className="px-5 py-3 font-semibold">Reference</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 text-niki-ink/70">
                      {(p.paidAt ?? p.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3 font-semibold text-niki-ink">{formatPrice(p.amount)}</td>
                    <td className="px-5 py-3 text-niki-ink/70">{p.method || "—"}</td>
                    <td className="px-5 py-3 text-niki-ink/70">{p.reference || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.status === "paid" ? "bg-niki-success/10 text-niki-success" : "bg-niki-gold/20 text-niki-ink/70"}`}>
                        {p.status === "paid" ? "Paid" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Container>
    </>
  );
}
