import type { Metadata } from "next";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { ReferralSettingsForm } from "@/components/admin/ReferralSettingsForm";
import { getDataSettings } from "@/lib/data-bundles/settings";

export const metadata: Metadata = { title: "Referral rates — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What the programme pays. Every commission is worked out from these at the
 * moment it is earned, so a change here changes the next payout and never a
 * past one.
 */
export default async function ReferralSettingsPage() {
  const settings = await getDataSettings();

  return (
    <div>
      <PanelHeading
        title="Rates & rules"
        subtitle="Joining rewards, team commission, and what counts as a qualifying sale."
      />
      <ReferralSettingsForm settings={settings} />
    </div>
  );
}
