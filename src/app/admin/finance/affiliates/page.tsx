import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Plus, Users } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { deleteAffiliate } from "@/lib/finance-actions";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Affiliates — Finance — NikiMart" };

export default async function AffiliatesPage() {
  await requireDashboard("/admin");
  const affiliates = await prisma.affiliate.findMany({
    orderBy: { createdAt: "desc" },
    include: { payouts: { select: { amount: true, status: true } } },
  });

  return (
    <>
      <PageHeader
        title="Affiliates & partners"
        subtitle="Referral partners you pay commissions to."
        crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Affiliates" }]}
      >
        <div className="flex items-center gap-2">
          <Link href="/admin/finance" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 hover:bg-white">
            <ArrowLeft className="h-4 w-4" /> Finance
          </Link>
          <Link href="/admin/finance/affiliates/new" className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light">
            <Plus className="h-4 w-4" /> Add affiliate
          </Link>
        </div>
      </PageHeader>

      <Container className="py-8">
        {affiliates.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-black/5">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-orange">
              <Users className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm text-niki-ink/60">No affiliates yet. Add a referral partner to start tracking their payments.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {affiliates.map((a) => {
              const paid = a.payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
              return (
                <div key={a.id} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display font-bold text-niki-ink">{a.name}</p>
                      {a.code ? <p className="text-xs font-medium text-niki-orange">{a.code}</p> : null}
                    </div>
                    <DeleteButton id={a.id} action={deleteAffiliate} />
                  </div>
                  <p className="mt-2 text-sm text-niki-ink/60">
                    {a.phone || "—"}{a.email ? ` · ${a.email}` : ""}
                  </p>
                  <p className="mt-3 text-xs text-niki-ink/40">Paid to date</p>
                  <p className="font-display text-lg font-bold text-niki-ink">{formatPrice(paid)}</p>
                  <Link href={`/admin/finance/affiliates/${a.id}`} className="mt-3 inline-block text-sm font-semibold text-niki-orange hover:underline">
                    Manage & pay →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Container>
    </>
  );
}
