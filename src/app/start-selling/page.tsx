import type { Metadata } from "next";
import { ArrowRight, Gift, Smartphone, Store } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActionLink } from "@/components/ui/motion";
import { formatMoney } from "@/lib/format";
import { getAffiliatePitch, getAgentProgramConfig } from "@/lib/settings";

export const metadata: Metadata = { title: "Start earning — NikiMart" };
export const dynamic = "force-dynamic";

/** One of the ways to earn. Whole card is the link, with a pressed state. */
function EarnCard({
  href,
  icon: Icon,
  title,
  cta,
  children,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <ActionLink
      href={href}
      className="group niki-lift block rounded-3xl bg-white p-7 ring-1 ring-niki-edge hover:shadow-xl hover:shadow-niki-navy/10"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-navy text-niki-orange transition-colors group-hover:bg-niki-orange group-hover:text-white">
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="mt-5 font-display text-xl font-bold text-niki-ink">{title}</h2>
      <p className="mt-2 text-sm text-niki-ink/60">{children}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-orange">
        {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </ActionLink>
  );
}

export default async function StartSellingPage() {
  const [pitch, program] = await Promise.all([getAffiliatePitch(), getAgentProgramConfig()]);

  // Reselling data only belongs here while the programme is actually open.
  const ways = program.enabled ? 3 : 2;

  return (
    <>
      <PageHeader
        title="Start earning on NikiMart"
        subtitle={`${ways === 3 ? "Three" : "Two"} ways to make money — pick what suits you.`}
        crumbs={[{ label: "Start earning" }]}
      />
      <Container className="max-w-5xl py-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <EarnCard href="/vendor-register" icon={Store} title="Open a shop" cta="Register a shop">
            Sell your own products or services. List items, manage orders, and get paid — you keep
            your sales minus a small platform commission.
          </EarnCard>

          {program.enabled ? (
            <EarnCard
              href="/become-an-agent"
              icon={Smartphone}
              title="Resell data bundles"
              cta="Apply to be an agent"
            >
              Get your own data storefront and set your own prices. No stock and nothing to pay up
              front — the {formatMoney(program.setupFee)} setup clears itself out of the commission
              you earn.
            </EarnCard>
          ) : null}

          <EarnCard href="/affiliate" icon={Gift} title="Become an affiliate" cta="Start referring">
            No shop or stock needed. <strong className="text-niki-ink">{pitch}</strong> Share
            products from your affiliate catalogue and earn on every sale referred through your
            links.
          </EarnCard>
        </div>
      </Container>
    </>
  );
}
