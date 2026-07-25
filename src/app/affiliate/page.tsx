import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, Gift, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { ShareButton } from "@/components/share/ShareButton";
import { BecomeAffiliateForm } from "@/components/affiliate/BecomeAffiliateForm";
import { RequestAffiliatePayoutForm } from "@/components/affiliate/RequestAffiliatePayoutForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateForUser, getAffiliateEarnings } from "@/lib/affiliate";
import { getAffiliateRate } from "@/lib/settings";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Affiliate — NikiMart" };

export default async function AffiliatePage() {
  const session = await auth();
  const rate = await getAffiliateRate();

  // Logged-out visitors get a proper affiliate landing (not a bare sign-in
  // redirect) with clear sign-in / create-account options that return here.
  if (!session?.user) {
    return (
      <>
        <PageHeader title="Become a NikiMart affiliate" subtitle="Earn commission for every sale you refer — no shop or stock needed." crumbs={[{ label: "Affiliate" }]} />
        <Container className="max-w-xl py-8">
          <div className="rounded-2xl bg-niki-navy p-6 text-white">
            <div className="flex items-center gap-2 text-niki-orange"><Gift className="h-5 w-5" /><span className="font-display font-bold">Refer & earn {rate}%</span></div>
            <p className="mt-2 text-sm text-white/70">
              Share your unique link and earn <strong className="text-white">{rate}%</strong> of every order placed through it.
              Sign in or create a free account to get your link.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/register?callbackUrl=/affiliate" className="flex-1 rounded-full bg-niki-orange px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light">
              Create a free account
            </Link>
            <Link href="/login?callbackUrl=/affiliate" className="flex-1 rounded-full px-5 py-3 text-center text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 transition-colors hover:bg-white">
              Sign in
            </Link>
          </div>
        </Container>
      </>
    );
  }

  const user = session.user;
  const affiliate = await getAffiliateForUser(user.id);

  if (!affiliate) {
    return (
      <>
        <PageHeader title="Become an affiliate" subtitle="Earn commission for every sale you refer to NikiMart." crumbs={[{ label: "Affiliate" }]} />
        <Container className="max-w-xl py-8">
          <div className="rounded-2xl bg-niki-navy p-6 text-white">
            <div className="flex items-center gap-2 text-niki-orange"><Gift className="h-5 w-5" /><span className="font-display font-bold">Refer & earn</span></div>
            <p className="mt-2 text-sm text-white/70">
              Get a unique link to share. When someone buys through it, you earn <strong className="text-white">{rate}%</strong> of the order.
              No shop or stock needed.
            </p>
          </div>
          <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
            <BecomeAffiliateForm />
          </div>
        </Container>
      </>
    );
  }

  const [earnings, payouts, recentOrders] = await Promise.all([
    getAffiliateEarnings(affiliate.id),
    prisma.affiliatePayout.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" } }),
    prisma.order.findMany({
      where: { affiliateId: affiliate.id, status: { notIn: ["cancelled", "pending"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { orderNumber: true, createdAt: true, affiliateCommission: true, total: true },
    }),
  ]);

  const refPath = `/?ref=${affiliate.code}`;

  return (
    <>
      <PageHeader title="Affiliate dashboard" subtitle={`Your referral code: ${affiliate.code}`} crumbs={[{ label: "Affiliate" }]} />
      <Container className="py-8">
        {/* Referral link */}
        <div className="rounded-3xl bg-niki-navy p-6 text-white sm:p-8">
          <div className="flex items-center gap-2 text-white/70"><BadgeCheck className="h-5 w-5 text-niki-orange" /><span className="text-sm font-medium">Your referral link</span></div>
          <p className="mt-2 break-all font-mono text-sm text-white/90">nikimart.vercel.app{refPath}</p>
          <div className="mt-4">
            <ShareButton path={refPath} title={`Shop on NikiMart with my link`} label="Share your link" tone="dark" />
          </div>
          <p className="mt-3 text-xs text-white/50">You earn {rate}% of every order placed through your link.</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Referred orders" value={earnings.referredOrders} />
          <StatCard label="Total earned" value={formatPrice(earnings.earned)} />
          <StatCard label="Paid out" value={formatPrice(earnings.paidOut)} />
          <StatCard label="Available" value={formatPrice(earnings.available)} />
        </div>

        {/* Payout request */}
        <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
          <div className="flex items-center gap-2 text-niki-ink"><Wallet className="h-5 w-5 text-niki-orange" /><h2 className="font-display font-bold">Request a payout</h2></div>
          <p className="mt-1 mb-3 text-sm text-niki-ink/60">Request any amount up to your available balance.</p>
          <RequestAffiliatePayoutForm available={earnings.available} />
        </div>

        {/* Referred orders */}
        <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">Referred orders</h2>
        {recentOrders.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-black/5">No referred orders yet. Share your link to start earning.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/50">
                <tr><th className="px-5 py-3 font-semibold">Order</th><th className="px-5 py-3 font-semibold">Date</th><th className="px-5 py-3 text-right font-semibold">Your commission</th></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {recentOrders.map((o) => (
                  <tr key={o.orderNumber}>
                    <td className="px-5 py-3 font-medium text-niki-ink">{o.orderNumber}</td>
                    <td className="px-5 py-3 text-niki-ink/60">{o.createdAt.toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="px-5 py-3 text-right font-semibold text-niki-ink">{formatPrice(o.affiliateCommission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {payouts.length > 0 ? (
          <>
            <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">Payout history</h2>
            <ul className="mt-4 divide-y divide-black/5 rounded-2xl bg-white ring-1 ring-black/5">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="text-niki-ink/70">{(p.paidAt ?? p.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })} · {p.method}</span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.status === "paid" ? "bg-niki-success/10 text-niki-success" : "bg-niki-gold/20 text-niki-ink/70"}`}>{p.status === "paid" ? "Paid" : "Pending"}</span>
                    <span className="font-semibold text-niki-ink">{formatPrice(p.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Container>
    </>
  );
}
