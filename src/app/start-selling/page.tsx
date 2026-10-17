import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Gift, Smartphone, Store } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { formatMoney } from "@/lib/format";
import { getAffiliatePitch } from "@/lib/settings";
import { getAgentProgramConfig } from "@/lib/data-bundles/settings";
import { getAffiliatePolicy, getAffiliateReferralConfig } from "@/lib/affiliate-settings";
import { getVendorRegistrationFee } from "@/lib/seller-registration";
import { teamRewardsLine } from "@/lib/affiliate-team-rules";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Start earning — Nickimart",
  description:
    "Three ways to earn on Nickimart: open a shop, resell data bundles, or refer products as an affiliate.",
};

export const dynamic = "force-dynamic";

/**
 * The three ways to earn, side by side.
 *
 * One page, one decision. What somebody arrives wanting to know is what each
 * one costs, what they get for it and what they have to do — so each card
 * answers those three in that order, with the price stated plainly rather than
 * discovered two screens later. Every price is read from the console that owns
 * it: the shop's from Settings, the bundle storefront's from the agent
 * programme, the affiliate's from the affiliate programme. Nothing here is
 * hardcoded, and a programme that is switched off is not offered.
 */

interface Way {
  href: string;
  icon: React.ElementType;
  title: string;
  blurb: string;
  fee: number;
  feeNote: string;
  points: string[];
  cta: string;
}

export default async function StartSellingPage() {
  const [pitch, program, policy, referral, shopFee] = await Promise.all([
    getAffiliatePitch(),
    getAgentProgramConfig(),
    getAffiliatePolicy(),
    getAffiliateReferralConfig(),
    getVendorRegistrationFee(),
  ]);

  const ways: Way[] = [
    {
      href: "/vendor-register",
      icon: Store,
      title: "Open a shop",
      blurb: "Sell your own products or services to buyers across Ghana.",
      fee: shopFee,
      feeNote: shopFee > 0 ? "once, to open the shop" : "no setup fee",
      points: [
        "Your own shop page and listings",
        "Orders, delivery and pickup handled for you",
        "Paid to MoMo or your bank",
      ],
      cta: "Register a shop",
    },
    ...(program.enabled
      ? [
          {
            href: "/become-an-agent",
            icon: Smartphone,
            title: "Resell data bundles",
            blurb: "Your own data storefront, at prices you set.",
            fee: program.setupFee,
            feeNote:
              program.setupFee > 0
                ? "clears out of what you earn"
                : "nothing to pay up front",
            points: [
              "MTN, Telecel and AirtelTigo, delivered in seconds",
              "You set the price on every bundle",
              "No stock, and nothing to deliver",
            ],
            cta: "Apply to be an agent",
          } satisfies Way,
        ]
      : []),
    ...(policy.enabled
      ? [
          {
            href: "/become-an-affiliate",
            icon: Gift,
            title: "Refer and earn",
            blurb: pitch,
            fee: policy.registrationFee,
            feeNote: policy.registrationFee > 0 ? "once, to join" : "free to join",
            points: [
              "The whole catalogue to share from",
              "A ready-made flyer for every product",
              referral.enabled
                ? teamRewardsLine(referral)
                : "Commission on every sale through your link",
            ],
            cta: "Start referring",
          } satisfies Way,
        ]
      : []),
  ];

  return (
    <div className="niki-gradient-hero">
      <Container className="max-w-6xl py-10 sm:py-14">
        <header className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/75 ring-1 ring-white/15">
            <BrandLogo className="h-3.5 w-auto text-niki-orange" />
            Nickimart partners
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold leading-tight text-white sm:text-5xl">
            Start earning on{" "}
            <span className="text-niki-orange">Nickimart</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
            {ways.length === 3 ? "Three ways" : "Two ways"} to make money with us. Pick the one
            that suits what you already have — a shop, a phone, or an audience.
          </p>
        </header>

        <div
          className={cn(
            "mt-10 grid gap-4 sm:mt-12 sm:gap-5",
            ways.length === 3 ? "md:grid-cols-3" : "sm:grid-cols-2",
          )}
        >
          {ways.map((way) => (
            <ActionLink
              key={way.href}
              href={way.href}
              className="group niki-focus flex flex-col rounded-3xl bg-white p-6 shadow-xl shadow-black/10 ring-1 ring-black/5 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/20 sm:p-7"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-black text-niki-orange transition-colors group-hover:bg-niki-orange group-hover:text-white">
                <way.icon className="h-6 w-6" />
              </span>

              <h2 className="mt-5 font-display text-xl font-bold text-niki-ink">{way.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-niki-ink/60">{way.blurb}</p>

              <p className="mt-5 flex items-baseline gap-2">
                <span className="font-figures text-2xl font-bold text-niki-ink">
                  {way.fee > 0 ? formatMoney(way.fee) : "Free"}
                </span>
                <span className="text-xs text-niki-ink/45">{way.feeNote}</span>
              </p>

              <ul className="mt-4 space-y-2 border-t border-niki-edge pt-4">
                {way.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-niki-ink/70">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-niki-orange" />
                    {point}
                  </li>
                ))}
              </ul>

              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-niki-orange">
                {way.cta}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </ActionLink>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-white/45">
          You can do all three on one Nickimart account.
        </p>
      </Container>
    </div>
  );
}
