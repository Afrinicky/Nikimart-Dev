import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  Link2,
  LogIn,
  Store,
  Tags,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActionLink } from "@/components/ui/motion";
import { JoinAgentForm } from "@/components/agent/JoinAgentForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/site";
import { formatPrice } from "@/lib/format";
import { getAgentProgramConfig, getDataStoreConfig } from "@/lib/settings";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getActiveBundles } from "@/lib/data-bundles/catalog";
import { NETWORK_INFO, bundleLabel } from "@/lib/data-bundles/networks";

export const metadata: Metadata = {
  title: "Become a Data Agent — NikiMart",
  description:
    "Open your own data bundle storefront under NikiMart. Set your own prices, sell to your customers, and earn on every bundle.",
};

export const dynamic = "force-dynamic";

const STEPS = [
  {
    icon: Store,
    title: "Open your store",
    body: "Pick a name and a link. Your storefront is live the moment you finish — nothing to pay up front.",
  },
  {
    icon: Tags,
    title: "Set your prices",
    body: "Every bundle shows what it costs you. Mark it up by whatever you like, in one go or row by row.",
  },
  {
    icon: Link2,
    title: "Share your link",
    body: "Send it to WhatsApp, your status, your group. Customers buy and pay on your page directly.",
  },
  {
    icon: Banknote,
    title: "Get paid",
    body: "Commission lands on your balance as each bundle is delivered. Withdraw it to MoMo whenever you like.",
  },
];

export default async function BecomeAnAgentPage() {
  const session = await auth();
  const [program, store] = await Promise.all([getAgentProgramConfig(), getDataStoreConfig()]);

  // Already an agent? There's nothing to pitch — send them to their platform.
  // Their saved phone pre-fills the support number on the form.
  let defaultPhone = "";
  if (session?.user?.id) {
    const existing = await getAgentForUser(session.user.id);
    if (existing) redirect("/agent");
    defaultPhone =
      (
        await prisma.user
          .findUnique({ where: { id: session.user.id }, select: { phone: true } })
          .catch(() => null)
      )?.phone ?? "";
  }

  // A sample of what they'd be reselling, so the numbers are concrete.
  const bundles = (await getActiveBundles()).filter((b) => b.agentPrice > 0);
  const samples = bundles
    .filter((b) => b.network === "MTN")
    .sort((a, b) => a.sizeGb - b.sizeGb)
    .slice(0, 4);

  return (
    <>
      <PageHeader
        title="Become a NikiMart data agent"
        subtitle={program.pitch}
        crumbs={[{ label: "Data bundles", href: "/data-bundles" }, { label: "Become an agent" }]}
        tone="dark"
      >
        <ActionLink
          href="#start"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
        >
          <Zap className="h-4 w-4" />
          Start now
        </ActionLink>
      </PageHeader>

      <Container className="py-8">
        {/* What you get */}
        <section className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-niki-surface text-niki-orange">
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="font-display text-sm font-bold text-niki-ink/25">0{i + 1}</span>
              </div>
              <p className="mt-3 font-display font-bold text-niki-ink">{s.title}</p>
              <p className="mt-1 text-sm text-niki-ink/60">{s.body}</p>
            </div>
          ))}
        </section>

        {/* What you'd earn */}
        {samples.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-display text-xl font-bold text-niki-ink">What you&apos;d pay</h2>
            <p className="mt-1 text-sm text-niki-ink/60">
              Your cost on a few MTN bundles. What you charge on top is yours.
            </p>
            <div className="stagger-children mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {samples.map((b) => {
                const info = NETWORK_INFO[b.network];
                const example = Math.round(b.agentPrice * 1.2 * 100) / 100;
                return (
                  <div
                    key={b.id}
                    className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5"
                  >
                    <div
                      className="px-4 py-3"
                      style={{
                        background: `linear-gradient(135deg, ${info.accentFrom}, ${info.accentTo})`,
                        color: info.onAccent,
                      }}
                    >
                      <p className="font-display text-sm font-bold">
                        {info.short} · {bundleLabel(b.sizeGb)}
                      </p>
                    </div>
                    <div className="p-4">
                      <p className="text-[11px] font-medium text-niki-ink/45">Your cost</p>
                      <p className="font-display text-xl font-bold text-niki-ink">
                        {formatPrice(b.agentPrice)}
                      </p>
                      <p className="mt-2 text-xs text-niki-ink/55">
                        Sell at {formatPrice(example)} and earn{" "}
                        <span className="font-semibold text-niki-success">
                          {formatPrice(Math.round((example - b.agentPrice) * 100) / 100)}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Sign-up */}
        <section id="start" className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <h2 className="font-display text-xl font-bold text-niki-ink">How the money works</h2>
            <div className="space-y-3">
              {[
                {
                  icon: Wallet,
                  title: "No stock, no float",
                  body: "You never fund an account. Your customer pays through Paystack when they buy, and NikiMart buys the bundle from that payment.",
                },
                {
                  icon: TrendingUp,
                  title: "You keep the difference",
                  body: "NikiMart charges you an agent price; you charge your customer whatever you set. The gap is credited to your balance once the bundle is delivered.",
                },
                {
                  icon: BadgeCheck,
                  title: `Setup costs ${formatPrice(program.setupFee)} — later`,
                  body: `Your storefront is charged to your balance rather than to you. The account opens at −${formatPrice(program.setupFee)} and clears itself out of your commissions.`,
                },
                {
                  icon: Banknote,
                  title: "Withdraw to MoMo",
                  body: `Minimum ${formatPrice(program.minWithdrawal)}${program.withdrawalFee > 0 ? `, with a flat ${formatPrice(program.withdrawalFee)} fee` : ""}. Paid by hand, usually the same day.`,
                },
              ].map((r) => (
                <div key={r.title} className="flex gap-3 rounded-2xl bg-white p-5 ring-1 ring-black/5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-surface text-niki-orange">
                    <r.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display font-bold text-niki-ink">{r.title}</p>
                    <p className="mt-1 text-sm text-niki-ink/60">{r.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 ring-1 ring-black/5 lg:sticky lg:top-6 lg:self-start">
            {!program.enabled ? (
              <>
                <p className="font-display text-lg font-bold text-niki-ink">Signup is closed</p>
                <p className="mt-2 text-sm text-niki-ink/60">
                  We&apos;re not taking new agents right now. Check back soon.
                </p>
              </>
            ) : !store.enabled ? (
              <>
                <p className="font-display text-lg font-bold text-niki-ink">Store temporarily closed</p>
                <p className="mt-2 text-sm text-niki-ink/60">
                  The bundle store is offline for maintenance. Signup reopens with it.
                </p>
              </>
            ) : session?.user?.id ? (
              <>
                <p className="font-display text-lg font-bold text-niki-ink">Open your store</p>
                <p className="mt-1 mb-5 text-sm text-niki-ink/60">
                  Two minutes, and you can change any of it later.
                </p>
                <JoinAgentForm
                  origin={siteUrl()}
                  setupFee={program.setupFee}
                  defaultPhone={defaultPhone}
                />
              </>
            ) : (
              <>
                <p className="font-display text-lg font-bold text-niki-ink">Sign in to start</p>
                <p className="mt-2 text-sm text-niki-ink/60">
                  Your agent platform sits on your NikiMart account, so sign in (or register — it
                  takes a minute) and you&apos;ll come straight back here.
                </p>
                <ActionLink
                  href="/login?callbackUrl=%2Fbecome-an-agent"
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in to continue
                </ActionLink>
                <ActionLink
                  href="/register?callbackUrl=%2Fbecome-an-agent"
                  className="mt-2 flex w-full items-center justify-center rounded-xl bg-niki-surface px-4 py-3 text-sm font-bold text-niki-ink/70 hover:bg-niki-navy/5"
                >
                  Create an account
                </ActionLink>
              </>
            )}
          </div>
        </section>
      </Container>
    </>
  );
}
