import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { PayoutForm } from "@/components/admin/PayoutForm";
import { AffiliateCommissionForm } from "@/components/admin/AffiliateCommissionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAffiliateEarnings } from "@/lib/affiliate";
import { getAffiliateRate } from "@/lib/settings";
import { createAffiliatePayout, markAffiliatePayoutPaid, setAffiliateStatus, deleteAffiliate } from "@/lib/finance-actions";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Manage affiliate — Admin — NikiMart" };

export default async function ManageAffiliatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireDashboard("/admin");
  const { id } = await params;
  const affiliate = await prisma.affiliate.findUnique({ where: { id }, include: { payouts: { orderBy: { createdAt: "desc" } } } });
  if (!affiliate) notFound();

  const [earnings, rate, referred] = await Promise.all([
    getAffiliateEarnings(affiliate.id),
    getAffiliateRate(),
    prisma.order.findMany({
      where: { affiliateId: affiliate.id, status: { notIn: ["cancelled", "pending"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, orderNumber: true, createdAt: true, subtotal: true, affiliateCommission: true },
    }),
  ]);
  const suspended = affiliate.status !== "active";

  return (
    <>
      <PageHeader
        title={affiliate.name}
        subtitle={affiliate.code ? `Referral code: ${affiliate.code}` : "Affiliate"}
        crumbs={[{ label: "Affiliates", href: "/admin/affiliates" }, { label: affiliate.name }]}
      >
        <Link href="/admin/affiliates" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 hover:bg-white">
          <ArrowLeft className="h-4 w-4" /> Affiliates
        </Link>
      </PageHeader>

      <Container className="py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Referred orders" value={earnings.referredOrders} />
              <StatCard label="Earned" value={formatPrice(earnings.earned)} />
              <StatCard label="Paid out" value={formatPrice(earnings.paidOut)} />
              <StatCard label="Available" value={formatPrice(earnings.available)} />
            </div>

            {/* Pending payout requests from this affiliate */}
            {affiliate.payouts.some((p) => p.status === "pending") ? (
              <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
                <h2 className="font-display font-bold text-niki-ink">Payout requests</h2>
                <div className="mt-3 space-y-2">
                  {affiliate.payouts.filter((p) => p.status === "pending").map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-niki-surface p-3 text-sm">
                      <span className="text-niki-ink/70">{formatPrice(p.amount)} · {p.method}{p.note ? ` · ${p.note.replace("Pay to: ", "")}` : ""}</span>
                      <form action={markAffiliatePayoutPaid}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="rounded-full bg-niki-success px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90">Mark paid</button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Record a payment */}
            <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
              <h2 className="font-display text-lg font-bold text-niki-ink">Record a payment</h2>
              <p className="mt-1 mb-4 text-sm text-niki-ink/60">Pay the affiliate, then log it here.</p>
              <PayoutForm action={createAffiliatePayout} hiddenName="affiliateId" hiddenValue={affiliate.id} cancelHref="/admin/affiliates" submitLabel="Record payment" />
            </div>

            {/* Referred orders */}
            <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
              <h2 className="font-display text-lg font-bold text-niki-ink">Referred orders</h2>
              {referred.length === 0 ? (
                <p className="mt-3 text-sm text-niki-ink/50">No referred orders yet.</p>
              ) : (
                <table className="mt-3 w-full text-left text-sm">
                  <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/40">
                    <tr><th className="py-2 font-semibold">Order</th><th className="py-2 font-semibold">Subtotal</th><th className="py-2 text-right font-semibold">Commission</th></tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {referred.map((o) => (
                      <tr key={o.id}>
                        <td className="py-2.5"><Link href={`/admin/orders/${o.id}`} className="font-medium text-niki-ink hover:text-niki-orange">{o.orderNumber}</Link></td>
                        <td className="py-2.5 text-niki-ink/60">{formatPrice(o.subtotal)}</td>
                        <td className="py-2.5 text-right font-semibold text-niki-ink">{formatPrice(o.affiliateCommission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {affiliate.payouts.length > 0 ? (
              <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
                <h2 className="font-display text-lg font-bold text-niki-ink">Payment history</h2>
                <ul className="mt-3 divide-y divide-black/5 text-sm">
                  {affiliate.payouts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                      <span className="text-niki-ink/70">{(p.paidAt ?? p.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })} · {p.method}</span>
                      <span className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.status === "paid" ? "bg-niki-success/10 text-niki-success" : "bg-niki-gold/20 text-niki-ink/70"}`}>{p.status === "paid" ? "Paid" : "Pending"}</span>
                        <span className="font-semibold text-niki-ink">{formatPrice(p.amount)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Management sidebar */}
          <aside className="h-fit space-y-4">
            <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
              <h2 className="font-display font-bold text-niki-ink">Profile</h2>
              <p className="mt-2 text-sm text-niki-ink/70">{affiliate.name}</p>
              {affiliate.phone ? <p className="mt-1 flex items-center gap-1.5 text-sm text-niki-ink/60"><Phone className="h-3.5 w-3.5" />{affiliate.phone}</p> : null}
              {affiliate.email ? <p className="mt-1 flex items-center gap-1.5 text-sm text-niki-ink/60"><Mail className="h-3.5 w-3.5" />{affiliate.email}</p> : null}
              <p className="mt-3 text-xs text-niki-ink/40">Referral link</p>
              <p className="break-all font-mono text-xs text-niki-orange">nikimart.vercel.app/?ref={affiliate.code}</p>
            </div>

            <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
              <h2 className="font-display font-bold text-niki-ink">Status</h2>
              <p className="mt-1 mb-3 text-sm text-niki-ink/60">
                {suspended ? "Suspended — not earning on new orders." : "Active — earning on referred orders."}
              </p>
              <form action={setAffiliateStatus}>
                <input type="hidden" name="id" value={affiliate.id} />
                <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
                <button type="submit" className={`w-full rounded-full px-4 py-2.5 text-sm font-semibold text-white ${suspended ? "bg-niki-success hover:opacity-90" : "bg-niki-danger hover:opacity-90"}`}>
                  {suspended ? "Reactivate affiliate" : "Suspend affiliate"}
                </button>
              </form>
            </div>

            <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
              <h2 className="font-display font-bold text-niki-ink">Commission</h2>
              <p className="mt-1 mb-3 text-sm text-niki-ink/60">Override the {rate}% program default for this affiliate.</p>
              <AffiliateCommissionForm id={affiliate.id} current={affiliate.commissionRate} defaultRate={rate} />
            </div>

            <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-niki-ink/70">Remove affiliate</span>
                <DeleteButton id={affiliate.id} action={deleteAffiliate} />
              </div>
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}
