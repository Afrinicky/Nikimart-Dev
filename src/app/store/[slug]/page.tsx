import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock3, MessageCircle, ShieldCheck, Store, Zap } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { BundleStore, type NetworkGroup } from "@/components/data/BundleStore";
import { formatPrice } from "@/lib/format";
import { getDataStoreConfig } from "@/lib/settings";
import { getAgentBySlug, getAgentStorefrontGroups } from "@/lib/data-bundles/agents";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const agent = await getAgentBySlug(slug);
  if (!agent) return { title: "Store not found — Nickimart" };
  return {
    title: `${agent.storeName} — Buy Data Bundles`,
    description:
      agent.storeTagline ||
      `Buy MTN, Telecel and AirtelTigo data bundles from ${agent.storeName}. Pay with Mobile Money and the data lands in seconds.`,
  };
}

/**
 * An agent's public storefront: the same pay-as-you-go flow as Nickimart's own
 * page, priced from this agent's ladder and credited to them. No cart and no
 * account — one bundle, one payment.
 */
export default async function AgentStorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = await getAgentBySlug(slug);
  if (!agent) notFound();

  const store = await getDataStoreConfig();

  // A closed store, a suspended agent, or a store outage all mean the same
  // thing to a customer: come back later.
  const closed = !store.enabled || agent.status !== "active" || !agent.storeOpen;
  if (closed) {
    return (
      <Container className="py-16">
        <div className="animate-fade-up mx-auto max-w-md rounded-3xl bg-white p-10 text-center ring-1 ring-niki-edge">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/40">
            <Store className="h-6 w-6" />
          </span>
          <p className="mt-4 font-display text-lg font-bold text-niki-ink">
            {agent.storeName} is closed right now
          </p>
          <p className="mt-2 text-sm text-niki-ink/60">
            This store isn&apos;t taking orders at the moment. Please check back shortly.
          </p>
          {agent.supportWhatsapp ? (
            <a
              href={`https://wa.me/${agent.supportWhatsapp.replace(/\D/g, "").replace(/^0/, "233")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="niki-press mt-5 inline-flex items-center gap-2 rounded-full bg-niki-ghana px-5 py-2.5 text-sm font-semibold text-white"
            >
              <MessageCircle className="h-4 w-4" />
              Message the store
            </a>
          ) : null}
        </div>
      </Container>
    );
  }

  const groups: NetworkGroup[] = (await getAgentStorefrontGroups(agent.id)).map((g) => ({
    network: g.network,
    bundles: g.bundles.map((b) => ({
      network: b.network,
      sizeGb: b.sizeGb,
      price: b.price,
      validity: b.validity,
    })),
  }));

  const afaPrice = agent.afaPrice > 0 ? agent.afaPrice : store.afaPrice;
  const showAfa = store.afaEnabled && agent.afaEnabled;

  return (
    <>
      <div className="border-b border-niki-edge bg-white">
        <Container className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-3 text-xs font-semibold text-niki-ink/60 sm:text-sm">
          <span className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-niki-orange" /> Delivered in seconds
          </span>
          <span className="flex items-center gap-1.5">
            <Clock3 className="h-4 w-4 text-niki-orange" /> No expiry on bundles
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-niki-orange" /> Paystack-secured payment
          </span>
        </Container>
      </div>

      <Container className="py-8">
        {agent.storeAbout ? (
          <p className="mb-6 rounded-2xl bg-white p-5 text-sm leading-relaxed text-niki-ink/70 ring-1 ring-niki-edge">
            {agent.storeAbout}
          </p>
        ) : null}

        <BundleStore
          groups={groups}
          storeSlug={agent.slug}
          trackHref={`/store/${agent.slug}/orders`}
        />

        {showAfa ? (
          <section className="niki-gradient-card mt-8 flex flex-col justify-between gap-4 rounded-2xl p-6 text-white sm:flex-row sm:items-center">
            <div>
              <p className="font-figures text-lg font-bold">AFA registration</p>
              <p className="mt-1 max-w-sm text-sm text-white/70">
                Register a number for AFA and unlock agent bundle rates. {formatPrice(afaPrice)} —
                done online, no paperwork.
              </p>
            </div>
            <ActionLink
              href={`/store/${agent.slug}/afa`}
              className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
            >
              <BadgeCheck className="h-4 w-4" />
              Register now
            </ActionLink>
          </section>
        ) : null}

        <p className="mt-8 text-center text-xs text-niki-ink/40">
          Data is credited to the exact number entered at checkout. Bundles sent to a wrong number
          cannot be reversed, so please double-check before paying.
        </p>
      </Container>
    </>
  );
}
