import type { Metadata } from "next";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { LeaderboardSettingsForm } from "@/components/admin/LeaderboardSettingsForm";
import { getDataSettings } from "@/lib/data-bundles/settings";

export const metadata: Metadata = { title: "Leaderboard rules — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What the boards measure and what a place is worth. Read at the moment a
 * board is drawn or a period is paid, so a change takes effect on the next one
 * with no deploy.
 */
export default async function LeaderboardSettingsPage() {
  const settings = await getDataSettings();

  return (
    <div className="max-w-3xl">
      <PanelHeading
        title="Rules"
        subtitle="Who qualifies, what is counted, and what each place pays in points."
      />
      <LeaderboardSettingsForm settings={settings} />
    </div>
  );
}
