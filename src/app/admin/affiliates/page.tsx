import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, Plus, Settings } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { StatCard } from "@/components/dashboard/StatCard";
import { ExportButton } from "@/components/admin/ExportButton";
import { requireDashboard } from "@/lib/session";
import { getAffiliateOverview, getAllAffiliatesWithStats } from "@/lib/affiliate";
import { getAffiliateRate } from "@/lib/settings";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Affiliates — Admin — NikiMart" };

export default async function AdminAffiliatesPage() {
  await requireDashboard("/admin");
  const [overview, rows, rate] = await Promise.all([getAffiliateOverview(), getAllAffiliatesWithStats(), getAffiliateRate()]);

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Affiliates</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            Affiliates earn on products enrolled in the programme — sellers enrol theirs at their own
            expense, and you can enrol any product at NikiMart&apos;s (capped at half the platform
            commission). Default rate {rate}%, overridable per category and per product.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton dataset="affiliates" />
          <Link href="/admin/settings" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white">
            <Settings className="h-4 w-4" /> Program settings
          </Link>
          <Link href="/admin/affiliates/new" className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light">
            <Plus className="h-4 w-4" /> Add affiliate
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Affiliates" value={`${overview.active}/${overview.total} active`} />
        <StatCard label="Referred sales" value={formatPrice(overview.referredSales)} href="/admin/finance/breakdown/gmv" />
        <StatCard label="Commission earned" value={formatPrice(overview.commissionEarned)} href="/admin/finance/breakdown/affiliateCost" />
        <StatCard label="Paid to affiliates" value={formatPrice(overview.paidOut)} href="/admin/finance/breakdown/affiliate" />
        <StatCard label="Owed to affiliates" value={formatPrice(overview.owed)} href="/admin/finance" />
      </div>

      {/* Roster */}
      <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">All affiliates</h2>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/50 ring-1 ring-niki-edge">
          No affiliates yet. People can join via <span className="font-semibold">Start Selling → Become an affiliate</span>, or add one here.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-5 py-3 font-semibold">Affiliate</th>
                <th className="px-5 py-3 font-semibold">Code</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Referred</th>
                <th className="px-5 py-3 font-semibold">Earned</th>
                <th className="px-5 py-3 font-semibold">Available</th>
                <th className="px-5 py-3 font-semibold sr-only">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-niki-surface">
                  <td className="px-5 py-3 font-medium text-niki-ink">
                    {a.name}
                    {a.isUser ? <span className="ml-2 rounded-full bg-niki-trust/10 px-2 py-0.5 text-[10px] font-semibold text-niki-trust">Self-registered</span> : null}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-niki-orange">{a.code ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${a.status === "active" ? "bg-niki-success/10 text-niki-success" : "bg-niki-danger/10 text-niki-danger"}`}>
                      {a.status === "active" ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-niki-ink/70">{a.earnings.referredOrders}</td>
                  <td className="px-5 py-3 text-niki-ink/70">{formatPrice(a.earnings.earned)}</td>
                  <td className="px-5 py-3 font-semibold text-niki-ink">{formatPrice(a.earnings.available)}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/affiliates/${a.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-niki-orange hover:underline">
                      Manage <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
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
