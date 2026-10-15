import type { Metadata } from "next";
import Link from "next/link";
import { Palette, Settings } from "lucide-react";
import { ModuleHeader, PanelHeading } from "@/components/admin/ModuleHeader";
import {
  AffiliateCodeForm,
  AffiliateProfileForm,
} from "@/components/affiliate/AffiliateProfileForm";
import { prisma } from "@/lib/prisma";
import { affiliateStoreLink, requireAffiliateConsole } from "@/lib/affiliate-console";
import { formatDay } from "@/components/affiliate/ConsoleTable";

export const metadata: Metadata = { title: "Settings — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The affiliate's own settings.
 *
 * Three things, in the order they matter: how they get paid, what their shares
 * say, and their code. The code is last because it is the one thing here that
 * can only be set once — it is printed on flyers and pasted into bios, so
 * changing it after people have followed those links breaks them silently.
 */
export default async function AffiliateSettingsPage() {
  const { affiliate, policy } = await requireAffiliateConsole();

  // Whether the code is still theirs to change: one click or one order and it
  // is out in the world.
  const [clicks, orders] = await Promise.all([
    prisma.affiliateClick.count({ where: { affiliateId: affiliate.id } }).catch(() => 0),
    prisma.order.count({ where: { affiliateId: affiliate.id } }).catch(() => 0),
  ]);

  return (
    <div className="max-w-3xl">
      <ModuleHeader
        title="Settings"
        subtitle="Your details, your payout method and your default flyer."
        icon={Settings}
      />

      <section className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-niki-edge sm:p-6">
        <AffiliateProfileForm
          affiliate={{
            name: affiliate.name,
            phone: affiliate.phone,
            shareMessage: affiliate.shareMessage,
            flyerTheme: affiliate.flyerTheme,
            payoutMethod: affiliate.payoutMethod,
            payoutName: affiliate.payoutName,
            payoutNumber: affiliate.payoutNumber,
            payoutNetwork: affiliate.payoutNetwork,
          }}
          defaultShareMessage={policy.shareMessage}
        />
      </section>

      <section className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-niki-edge sm:p-6">
        <PanelHeading
          title="Flyer design"
          subtitle="The colours, the layout and the lettering on the flyers you share."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/affiliate/settings/flyer"
            className="niki-press inline-flex items-center gap-2 rounded-lg bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
          >
            <Palette className="h-4 w-4" />
            Design my flyer
          </Link>
          <p className="text-sm text-niki-ink/55">
            {affiliate.flyerDesign
              ? "You're using a design of your own."
              : "You're using Nickimart's house design."}
          </p>
        </div>
      </section>

      <section className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-niki-edge sm:p-6">
        <PanelHeading
          title="Your referral code"
          subtitle={`Your store-wide link is ${affiliateStoreLink(affiliate.code)}`}
        />
        <AffiliateCodeForm code={affiliate.code} locked={clicks > 0 || orders > 0} />
      </section>

      <section className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-niki-edge sm:p-6">
        <PanelHeading title="Your account" />
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-niki-ink/45">Status</dt>
            <dd className="mt-0.5 font-semibold text-niki-ink">
              {affiliate.status === "active"
                ? "Active"
                : affiliate.status === "pending"
                  ? "Awaiting approval"
                  : "On hold"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-niki-ink/45">Joined</dt>
            <dd className="mt-0.5 font-semibold text-niki-ink">{formatDay(affiliate.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-niki-ink/45">Your commission</dt>
            <dd className="mt-0.5 font-semibold text-niki-ink">
              {affiliate.commissionRate
                ? `${affiliate.commissionRate}% minimum, or the product's rate if higher`
                : `Set per product — ${policy.defaultRate}% where nothing else applies`}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-niki-ink/45">Referral window</dt>
            <dd className="mt-0.5 font-semibold text-niki-ink">
              {policy.attributionWindowDays} days
              <span className="ml-1 text-xs font-medium text-niki-ink/50">
                ({policy.attributionModel === "last" ? "last click wins" : "first click wins"})
              </span>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
