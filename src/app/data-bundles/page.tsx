import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock3, MessageCircle, Search, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { BundleStore, type NetworkGroup } from "@/components/data/BundleStore";
import { getActiveBundles, groupByNetwork } from "@/lib/data-bundles/catalog";
import { getDataStoreConfig } from "@/lib/settings";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Buy Data Bundles — NikiMart",
  description:
    "MTN, Telecel and AirtelTigo data bundles at agent prices. Pay with Mobile Money and the data lands in seconds.",
};

// Prices change from the admin console, so don't serve a stale ladder.
export const dynamic = "force-dynamic";

const STEPS = [
  { icon: Smartphone, title: "Pick your network & size", body: "MTN, Telecel, AirtelTigo iShare or BigTime — choose the bundle you want." },
  { icon: ShieldCheck, title: "Enter the number", body: "The data goes to the number you type. We check it matches the network first." },
  { icon: Zap, title: "Pay with MoMo", body: "Secure Paystack checkout. Your bundle is sent the moment payment clears." },
];

export default async function DataBundlesPage() {
  const [config, bundles] = await Promise.all([getDataStoreConfig(), getActiveBundles()]);

  if (!config.enabled) notFound();

  const groups: NetworkGroup[] = groupByNetwork(bundles).map((g) => ({
    network: g.network,
    bundles: g.bundles.map((b) => ({
      network: b.network,
      sizeGb: b.sizeGb,
      price: b.price,
      validity: b.validity,
    })),
  }));

  return (
    <>
      <PageHeader
        title={config.name}
        subtitle={config.tagline}
        crumbs={[{ label: "Data bundles" }]}
        tone="dark"
      >
        <div className="flex flex-wrap gap-2">
          <Link
            href="/data-bundles/orders"
            className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 transition-colors hover:bg-white/20"
          >
            <Search className="h-4 w-4" />
            Track order
          </Link>
          {config.afaEnabled ? (
            <Link
              href="/data-bundles/afa"
              className="flex items-center gap-2 rounded-full bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
            >
              <BadgeCheck className="h-4 w-4" />
              AFA registration
            </Link>
          ) : null}
        </div>
      </PageHeader>

      {/* Trust strip */}
      <div className="border-b border-black/5 bg-white">
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
        <BundleStore groups={groups} />

        {/* How it works */}
        <section className="mt-12">
          <h2 className="font-display text-xl font-bold text-niki-ink">How it works</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-niki-surface text-niki-orange">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="font-display text-sm font-bold text-niki-ink/30">
                    0{i + 1}
                  </span>
                </div>
                <p className="mt-3 font-display font-bold text-niki-ink">{s.title}</p>
                <p className="mt-1 text-sm text-niki-ink/60">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* AFA + support */}
        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          {config.afaEnabled ? (
            <div className="niki-gradient-card flex flex-col justify-between gap-4 rounded-2xl p-6 text-white sm:flex-row sm:items-center">
              <div>
                <p className="font-display text-lg font-bold">AFA registration</p>
                <p className="mt-1 max-w-sm text-sm text-white/70">
                  Register a number for AFA and unlock agent bundle rates. Costs{" "}
                  {formatPrice(config.afaPrice)} — done online, no paperwork.
                </p>
              </div>
              <Link
                href="/data-bundles/afa"
                className="shrink-0 rounded-full bg-niki-orange px-5 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
              >
                Register now
              </Link>
            </div>
          ) : null}

          <div className="flex flex-col justify-between gap-4 rounded-2xl bg-white p-6 ring-1 ring-black/5 sm:flex-row sm:items-center">
            <div>
              <p className="font-display text-lg font-bold text-niki-ink">Need help with an order?</p>
              <p className="mt-1 max-w-sm text-sm text-niki-ink/60">
                Look up any order with your reference or the number you paid with.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/data-bundles/orders"
                className="rounded-full bg-niki-navy px-5 py-2.5 text-sm font-semibold text-white"
              >
                Track order
              </Link>
              {config.whatsapp ? (
                <a
                  href={config.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-full bg-niki-ghana px-5 py-2.5 text-sm font-semibold text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-niki-ink/40">
          Data is credited to the exact number entered at checkout. Bundles sent to a wrong number
          cannot be reversed, so please double-check before paying.
        </p>
      </Container>
    </>
  );
}
