import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { AffiliatePolicyForm } from "@/components/admin/AffiliatePolicyForm";
import { StatCard } from "@/components/dashboard/StatCard";
import { requireDashboard } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Affiliate policy — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The rules the whole programme runs on.
 *
 * Everything here is read through one resolver (lib/affiliate-policy), which
 * the checkout, the affiliate console and this screen all share — so a window
 * changed here is the window attribution uses, and there is no second copy of
 * the arithmetic to disagree with it.
 *
 * What a change does and does not reach is the thing worth being clear about,
 * and the panel below says it: policy is snapshotted onto each referral and
 * each commission line when it is created. Shortening the window or the return
 * period moves what happens next and leaves what people were already promised
 * exactly where it was.
 */
export default async function AdminAffiliateSettingsPage() {
  await requireDashboard("/admin");
  const [settings, policy] = await Promise.all([getSettings(), getAffiliatePolicy()]);

  return (
    <Container className="py-8">
      <AffiliateModuleHeader />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Programme" value={policy.enabled ? "Running" : "Switched off"} />
        <StatCard label="Attribution window" value={`${policy.attributionWindowDays} days`} />
        <StatCard
          label="Commission clears"
          value={policy.returnWindowDays > 0 ? `${policy.returnWindowDays} days after delivery` : "On delivery"}
        />
        <StatCard label="Smallest payout" value={formatMoney(policy.minPayout)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge sm:p-6">
          <PanelHeading
            title="Programme policy"
            subtitle="Attribution, commission, payouts and abuse controls."
          />
          <AffiliatePolicyForm settings={settings as unknown as Record<string, string>} />
        </section>

        <aside className="h-fit space-y-4">
          <div className="rounded-2xl bg-niki-black p-5 text-white">
            <p className="font-display font-bold">What a change reaches</p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              The attribution window and the return window are snapshotted onto each referral and
              each commission line when it is created. Changing them moves what happens from now
              on; a referral already running keeps the window it was given, and commission already
              earned keeps the rate and the hold it was promised.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <p className="font-display font-bold text-niki-ink">Where the rates live</p>
            <ul className="mt-2 space-y-2 text-sm text-niki-ink/65">
              <li>
                <Link href="/admin/affiliates/products" className="font-semibold text-niki-orange hover:underline">
                  Product eligibility
                </Link>{" "}
                — which products pay, and out of whose money.
              </li>
              <li>
                <Link href="/admin/categories" className="font-semibold text-niki-orange hover:underline">
                  Categories
                </Link>{" "}
                — a default rate for a whole category.
              </li>
              <li>
                <Link href="/admin/affiliates" className="font-semibold text-niki-orange hover:underline">
                  Affiliates
                </Link>{" "}
                — a negotiated floor for one person.
              </li>
              <li>
                <Link href="/admin/settings" className="font-semibold text-niki-orange hover:underline">
                  Settings
                </Link>{" "}
                — the platform commission these are funded out of.
              </li>
            </ul>
          </div>

          <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <p className="font-display font-bold text-niki-ink">The funding rule</p>
            <p className="mt-2 text-sm leading-relaxed text-niki-ink/65">
              A seller may offer whatever they like out of their own margin. Nickimart never funds
              more than half of the commission it earns on an item, so the house always keeps at
              least half of what it makes. Both ceilings are enforced at the point of sale, not just
              in the form.
            </p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
