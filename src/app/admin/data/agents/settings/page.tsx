import type { Metadata } from "next";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AgentProgrammeSettingsForm } from "@/components/admin/DataStoreSettingsForm";
import { getDataSettings } from "@/lib/data-bundles/settings";

export const metadata: Metadata = { title: "Agent programme settings — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The rules the agent network runs on, in the module that runs it. They used
 * to sit under Store settings, two modules away from the agents they price.
 */
export default async function AgentProgrammeSettingsPage() {
  const settings = await getDataSettings();

  return (
    <div className="max-w-2xl">
      <PanelHeading
        title="Programme settings"
        subtitle="What it costs to become an agent, what they pay for bundles, and how they get paid."
      />
      <AgentProgrammeSettingsForm settings={settings} />
    </div>
  );
}
