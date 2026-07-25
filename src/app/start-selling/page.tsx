import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Gift, Store } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAffiliateRate } from "@/lib/settings";

export const metadata: Metadata = { title: "Start earning — NikiMart" };

export default async function StartSellingPage() {
  const rate = await getAffiliateRate();
  return (
    <>
      <PageHeader title="Start earning on NikiMart" subtitle="Two ways to make money — pick what suits you." crumbs={[{ label: "Start earning" }]} />
      <Container className="max-w-4xl py-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Link href="/vendor-register" className="group rounded-3xl bg-white p-7 ring-1 ring-black/5 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-niki-navy/10">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-navy text-niki-orange transition-colors group-hover:bg-niki-orange group-hover:text-white">
              <Store className="h-6 w-6" />
            </span>
            <h2 className="mt-5 font-display text-xl font-bold text-niki-ink">Open a shop</h2>
            <p className="mt-2 text-sm text-niki-ink/60">
              Sell your own products or services. List items, manage orders, and get paid — you keep your sales minus a small platform commission.
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-orange">
              Register a shop <ArrowRight className="h-4 w-4" />
            </span>
          </Link>

          <Link href="/affiliate" className="group rounded-3xl bg-white p-7 ring-1 ring-black/5 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-niki-navy/10">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-navy text-niki-orange transition-colors group-hover:bg-niki-orange group-hover:text-white">
              <Gift className="h-6 w-6" />
            </span>
            <h2 className="mt-5 font-display text-xl font-bold text-niki-ink">Become an affiliate</h2>
            <p className="mt-2 text-sm text-niki-ink/60">
              No shop or stock needed. Share your referral link and earn <strong className="text-niki-ink">{rate}%</strong> of every order placed through it.
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-orange">
              Start referring <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </div>
      </Container>
    </>
  );
}
