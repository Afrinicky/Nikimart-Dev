import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { PayoutForm } from "@/components/admin/PayoutForm";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createAffiliatePayout } from "@/lib/finance-actions";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Affiliate — Finance — NikiMart" };

export default async function AffiliateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireDashboard("/admin");
  const { id } = await params;
  const affiliate = await prisma.affiliate.findUnique({
    where: { id },
    include: { payouts: { orderBy: { createdAt: "desc" } } },
  });
  if (!affiliate) notFound();

  const paid = affiliate.payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHeader
        title={affiliate.name}
        subtitle={affiliate.code ? `Referral code: ${affiliate.code}` : "Affiliate partner"}
        crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Affiliates", href: "/admin/finance/affiliates" }, { label: affiliate.name }]}
      >
        <Link href="/admin/finance/affiliates" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 hover:bg-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </PageHeader>

      <Container className="max-w-2xl py-8">
        <div className="rounded-2xl bg-niki-navy p-6 text-white">
          <p className="text-sm text-white/60">Paid to date</p>
          <p className="mt-1 font-display text-3xl font-bold">{formatPrice(paid)}</p>
          {affiliate.phone || affiliate.email ? (
            <p className="mt-2 text-sm text-white/60">{[affiliate.phone, affiliate.email].filter(Boolean).join(" · ")}</p>
          ) : null}
        </div>

        <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
          <h2 className="font-display text-lg font-bold text-niki-ink">Record a commission payment</h2>
          <p className="mt-1 mb-4 text-sm text-niki-ink/60">Pay the affiliate, then log the amount and reference here.</p>
          <PayoutForm
            action={createAffiliatePayout}
            hiddenName="affiliateId"
            hiddenValue={affiliate.id}
            cancelHref="/admin/finance/affiliates"
            submitLabel="Record payment"
          />
        </div>

        {affiliate.payouts.length > 0 ? (
          <div className="mt-6">
            <h3 className="font-display font-bold text-niki-ink">Payment history</h3>
            <ul className="mt-3 divide-y divide-black/5 rounded-2xl bg-white ring-1 ring-black/5">
              {affiliate.payouts.map((p) => (
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
