import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, Banknote, Percent, Users, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ExportButton } from "@/components/admin/ExportButton";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getFinanceOverview, getVendorSettlements } from "@/lib/finance";
import { getCommissionRate } from "@/lib/settings";
import { markPayoutPaid, markAffiliatePayoutPaid } from "@/lib/finance-actions";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Finance — Admin — NikiMart" };

export default async function AdminFinancePage() {
  await requireDashboard("/admin");

  const [overview, settlements, defaultRate, categories, recentPayouts, recentAffPayouts, pendingRequests] = await Promise.all([
    getFinanceOverview(),
    getVendorSettlements(),
    getCommissionRate(),
    prisma.category.findMany({ where: { commissionRate: { not: null } }, select: { name: true, commissionRate: true }, orderBy: { name: "asc" } }),
    prisma.payout.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { vendor: { select: { businessName: true } } } }),
    prisma.affiliatePayout.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { affiliate: { select: { name: true } } } }),
    prisma.payout.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, include: { vendor: { select: { businessName: true } } } }),
  ]);
  const pendingAffiliateRequests = await prisma.affiliatePayout.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, include: { affiliate: { select: { name: true } } } });

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Finance</h1>
          <p className="mt-1 text-sm text-niki-ink/60">Commissions, seller payouts, affiliate payments, and accounts.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton dataset="finance" />
          <Link href="/admin/affiliates" className="flex items-center gap-2 rounded-full bg-niki-navy px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-navy-light">
            <Users className="h-4 w-4" />
            Affiliates
          </Link>
        </div>
      </div>

      {/* Platform KPIs — each opens its breakdown */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {([
          ["gmv", "Gross merchandise value", overview.gmv],
          ["commission", "Commission earned", overview.commission],
          ["owed", "Owed to sellers", overview.owedToSellers],
          ["paid", "Paid to sellers", overview.sellerPaidOut],
          ["escrow", "In escrow (undelivered)", overview.inEscrow],
          ["delivery", "Delivery collected", overview.delivery],
          ["affiliate", "Affiliate payments", overview.affiliatePaid],
          ["affiliateCost", "Affiliate commission accrued", overview.affiliateAccrued],
          ["earnings", "Platform earnings (net)", overview.platformEarnings],
        ] as const).map(([metric, label, value]) => (
          <Link key={metric} href={`/admin/finance/breakdown/${metric}`} className="group rounded-2xl bg-white p-5 ring-1 ring-niki-edge transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-niki-navy/5">
            <p className="font-display text-2xl font-bold text-niki-ink">{formatPrice(value)}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-niki-ink/60">
              {label}
              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
          </Link>
        ))}
      </div>

      {/* Commission config summary */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge lg:col-span-1">
          <div className="flex items-center gap-2 text-niki-ink">
            <Percent className="h-5 w-5 text-niki-orange" />
            <h2 className="font-display font-bold">Commission</h2>
          </div>
          <p className="mt-3 text-3xl font-bold text-niki-ink">{defaultRate}%</p>
          <p className="text-sm text-niki-ink/60">Platform default per sale</p>
          {categories.length > 0 ? (
            <ul className="mt-4 space-y-1.5 border-t border-niki-edge pt-4 text-sm">
              {categories.map((c) => (
                <li key={c.name} className="flex justify-between text-niki-ink/70">
                  <span>{c.name}</span>
                  <span className="font-semibold text-niki-ink">{c.commissionRate}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-niki-ink/50">No per-category overrides set.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <Link href="/admin/settings" className="font-semibold text-niki-orange hover:underline">Edit default →</Link>
            <Link href="/admin/categories" className="font-semibold text-niki-orange hover:underline">Per-category →</Link>
          </div>

          {/* Where affiliate commission actually comes from. */}
          <div className="mt-6 border-t border-niki-edge pt-4">
            <h3 className="text-sm font-semibold text-niki-ink">Affiliate commission funded by</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              <li className="flex justify-between text-niki-ink/70">
                <span>Sellers (their own enrolments)</span>
                <span className="font-semibold text-niki-ink">{formatPrice(overview.affiliateFundedBySellers)}</span>
              </li>
              <li className="flex justify-between text-niki-ink/70">
                <span>NikiMart (platform enrolments)</span>
                <span className="font-semibold text-niki-ink">{formatPrice(overview.affiliateFundedByPlatform)}</span>
              </li>
            </ul>
            <p className="mt-2 text-xs text-niki-ink/50">
              NikiMart-funded enrolments are capped at half the platform commission on the item.
            </p>
          </div>
        </div>

        {/* Recent payouts */}
        <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge lg:col-span-2">
          <div className="flex items-center gap-2 text-niki-ink">
            <Banknote className="h-5 w-5 text-niki-orange" />
            <h2 className="font-display font-bold">Recent payments</h2>
          </div>
          {recentPayouts.length === 0 && recentAffPayouts.length === 0 ? (
            <p className="mt-3 text-sm text-niki-ink/50">No payments recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-niki-edge text-sm">
              {recentPayouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="text-niki-ink/70">
                    <span className="font-medium text-niki-ink">{p.vendor.businessName}</span>
                    <span className="ml-2 text-xs text-niki-ink/40">seller · {(p.paidAt ?? p.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</span>
                  </span>
                  <span className="font-semibold text-niki-ink">{formatPrice(p.amount)}</span>
                </li>
              ))}
              {recentAffPayouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="text-niki-ink/70">
                    <span className="font-medium text-niki-ink">{p.affiliate.name}</span>
                    <span className="ml-2 text-xs text-niki-ink/40">affiliate · {(p.paidAt ?? p.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</span>
                  </span>
                  <span className="font-semibold text-niki-ink">{formatPrice(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Pending payout requests from sellers */}
      {pendingRequests.length > 0 ? (
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold text-niki-ink">Payout requests</h2>
          <p className="mt-1 text-sm text-niki-ink/60">Sellers awaiting payment. Pay them, then mark the request as paid.</p>
          <div className="mt-4 space-y-3">
            {pendingRequests.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
                <div className="min-w-0">
                  <p className="font-semibold text-niki-ink">{p.vendor.businessName} · {formatPrice(p.amount)}</p>
                  <p className="mt-0.5 text-xs text-niki-ink/60">{p.method}{p.note ? ` · ${p.note.replace("Requested by seller — ", "")}` : ""}</p>
                </div>
                <form action={markPayoutPaid}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="rounded-full bg-niki-success px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90">
                    Mark paid
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Pending affiliate payout requests */}
      {pendingAffiliateRequests.length > 0 ? (
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold text-niki-ink">Affiliate payout requests</h2>
          <div className="mt-4 space-y-3">
            {pendingAffiliateRequests.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
                <div className="min-w-0">
                  <p className="font-semibold text-niki-ink">{p.affiliate.name} · {formatPrice(p.amount)}</p>
                  <p className="mt-0.5 text-xs text-niki-ink/60">{p.method}{p.note ? ` · ${p.note.replace("Pay to: ", "")}` : ""}</p>
                </div>
                <form action={markAffiliatePayoutPaid}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="rounded-full bg-niki-success px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90">Mark paid</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Seller settlements */}
      <div className="mt-8 flex items-center gap-2">
        <Wallet className="h-5 w-5 text-niki-orange" />
        <h2 className="font-display text-lg font-bold text-niki-ink">Seller settlements</h2>
      </div>
      {settlements.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-niki-edge">
          No seller sales yet. Settlements appear here once sellers make sales.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-5 py-3 font-semibold">Seller</th>
                <th className="px-5 py-3 font-semibold">Gross</th>
                <th className="px-5 py-3 font-semibold">Commission</th>
                <th className="px-5 py-3 font-semibold">Cleared</th>
                <th className="px-5 py-3 font-semibold">Paid out</th>
                <th className="px-5 py-3 font-semibold">Available</th>
                <th className="px-5 py-3 font-semibold sr-only">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {settlements.map((s) => (
                <tr key={s.id} className="hover:bg-niki-surface">
                  <td className="px-5 py-3 font-medium text-niki-ink">{s.businessName}</td>
                  <td className="px-5 py-3 text-niki-ink/70">{formatPrice(s.earnings.gross)}</td>
                  <td className="px-5 py-3 text-niki-ink/70">{formatPrice(s.earnings.commission)}</td>
                  <td className="px-5 py-3 text-niki-ink/70">{formatPrice(s.earnings.cleared)}</td>
                  <td className="px-5 py-3 text-niki-ink/70">{formatPrice(s.earnings.paidOut)}</td>
                  <td className="px-5 py-3 font-semibold text-niki-ink">{formatPrice(s.earnings.available)}</td>
                  <td className="px-5 py-3 text-right">
                    {s.earnings.available > 0 ? (
                      <Link href={`/admin/finance/sellers/${s.id}`} className="inline-flex items-center gap-1 rounded-full bg-niki-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-niki-orange-light">
                        Pay out <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <span className="text-xs text-niki-ink/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
