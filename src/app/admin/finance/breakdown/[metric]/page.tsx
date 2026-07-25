import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireDashboard } from "@/lib/session";
import { getFinanceBreakdown, FINANCE_METRICS, type FinanceMetric } from "@/lib/finance";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Finance breakdown — Admin — NikiMart" };

export default async function FinanceBreakdownPage({ params }: { params: Promise<{ metric: string }> }) {
  await requireDashboard("/admin");
  const { metric } = await params;
  if (!FINANCE_METRICS.includes(metric as FinanceMetric)) notFound();

  const data = await getFinanceBreakdown(metric as FinanceMetric);

  return (
    <>
      <PageHeader title={data.title} subtitle={data.description} crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: data.title }]}>
        <Link href="/admin/finance" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 hover:bg-white">
          <ArrowLeft className="h-4 w-4" /> Finance
        </Link>
      </PageHeader>

      <Container className="py-8">
        <div className="rounded-3xl bg-niki-navy p-6 text-white">
          <p className="text-sm text-white/60">{data.title}</p>
          <p className="mt-1 font-display text-3xl font-bold">{formatPrice(data.total)}</p>
          <p className="mt-1 text-sm text-white/50">{data.rows.length} {data.rows.length === 1 ? "entry" : "entries"}</p>
        </div>

        {data.rows.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/50 ring-1 ring-black/5">Nothing here yet.</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/50">
                <tr>
                  <th className="px-5 py-3 font-semibold">{data.columns[0]}</th>
                  <th className="px-5 py-3 font-semibold">{data.columns[1]}</th>
                  <th className="px-5 py-3 text-right font-semibold">{data.columns[2]}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-niki-surface">
                    <td className="px-5 py-3 font-medium text-niki-ink">
                      {r.href ? <Link href={r.href} className="hover:text-niki-orange">{r.primary}</Link> : r.primary}
                    </td>
                    <td className="px-5 py-3 text-niki-ink/60">{r.secondary}</td>
                    <td className="px-5 py-3 text-right font-semibold text-niki-ink">{formatPrice(r.amount)}</td>
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
