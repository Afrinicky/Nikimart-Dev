import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { PayoutForm } from "@/components/admin/PayoutForm";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSellerEarnings } from "@/lib/seller";
import { createSellerPayout } from "@/lib/finance-actions";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Pay seller — Finance — NikiMart" };

export default async function PaySellerPage({ params }: { params: Promise<{ vendorId: string }> }) {
  await requireDashboard("/admin");
  const { vendorId } = await params;
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, businessName: true } });
  if (!vendor) notFound();

  const [earnings, payouts] = await Promise.all([
    getSellerEarnings(vendor.id),
    prisma.payout.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <>
      <PageHeader title={`Pay ${vendor.businessName}`} crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Pay seller" }]}>
        <Link href="/admin/finance" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 hover:bg-white">
          <ArrowLeft className="h-4 w-4" /> Finance
        </Link>
      </PageHeader>

      <Container className="max-w-2xl py-8">
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Cleared" value={formatPrice(earnings.cleared)} />
          <StatCard label="Paid out" value={formatPrice(earnings.paidOut)} />
          <StatCard label="Available" value={formatPrice(earnings.available)} />
        </div>

        <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
          <h2 className="font-display text-lg font-bold text-niki-ink">Record a payout</h2>
          <p className="mt-1 mb-4 text-sm text-niki-ink/60">
            Pay the seller through Mobile Money or bank, then record it here. It&apos;s deducted from their available balance.
          </p>
          {earnings.available > 0 ? (
            <PayoutForm
              action={createSellerPayout}
              hiddenName="vendorId"
              hiddenValue={vendor.id}
              defaultAmount={earnings.available}
              cancelHref="/admin/finance"
            />
          ) : (
            <p className="rounded-xl bg-niki-surface p-4 text-sm text-niki-ink/60">Nothing available to pay out right now.</p>
          )}
        </div>

        {payouts.length > 0 ? (
          <div className="mt-6">
            <h3 className="font-display font-bold text-niki-ink">Payout history</h3>
            <ul className="mt-3 divide-y divide-black/5 rounded-2xl bg-white ring-1 ring-black/5">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="text-niki-ink/70">
                    {(p.paidAt ?? p.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
                    {p.method ? <span className="ml-2 text-xs text-niki-ink/40">{p.method}</span> : null}
                    {p.reference ? <span className="ml-2 text-xs text-niki-ink/40">· {p.reference}</span> : null}
                  </span>
                  <span className="font-semibold text-niki-ink">{formatPrice(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Container>
    </>
  );
}
