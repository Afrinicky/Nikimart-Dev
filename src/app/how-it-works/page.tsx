import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "How NikiMart Works",
};

const STEPS = [
  { title: "Search or paste a product link", body: "Browse NikiMart, or paste a link from Amazon, eBay, Alibaba, AliExpress, or a Dubai store into Buy-for-Me." },
  { title: "Get a full landed-cost estimate", body: "See the product price plus foreign delivery, international freight, customs, pickup, and our service fee — no surprises." },
  { title: "Pay securely in Ghana", body: "Pay in Ghana Cedis with Mobile Money, card, or bank transfer. Your funds are held safely until your order is on track." },
  { title: "Item ships to our foreign warehouse", body: "The seller ships your item to our partner warehouse abroad, where we consolidate and prepare it for freight." },
  { title: "Freight partner clears it", body: "We ship your item to Ghana and our freight partner handles customs clearance." },
  { title: "Collect at a pickup point", body: "Your item arrives at your chosen pickup point. Collect it securely with a one-time OTP." },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        title="How NikiMart Works"
        subtitle="Shop the world and pick up in Ghana — here's the journey from cart to collection."
        crumbs={[{ label: "How it works" }]}
        tone="dark"
      />

      <Container className="py-10">
        <ol className="relative space-y-6 border-l-2 border-dashed border-niki-orange/30 pl-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative">
              <span className="absolute -left-[35px] flex h-7 w-7 items-center justify-center rounded-full bg-niki-orange font-display text-xs font-bold text-white ring-4 ring-niki-surface">
                {i + 1}
              </span>
              <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
                <h3 className="font-semibold text-niki-ink">{step.title}</h3>
                <p className="mt-1.5 text-sm text-niki-ink/60">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-3xl bg-niki-navy p-8 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-niki-gold">
            <CheckCircle2 className="h-4 w-4" />
            Covered by NikiMart Buyer Protection at every step
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold text-white">Ready to shop the world?</h2>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/global-shopping"
              className="flex items-center gap-2 rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
            >
              Start global shopping
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/buy-for-me"
              className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/10"
            >
              Paste a product link
            </Link>
          </div>
        </div>
      </Container>
    </>
  );
}
