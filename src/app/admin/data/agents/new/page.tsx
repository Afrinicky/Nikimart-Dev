import type { Metadata } from "next";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { RegisterAgentForm } from "@/components/admin/RegisterAgentForm";
import { requireAdmin } from "@/lib/session";
import { getAgentProgramConfig } from "@/lib/data-bundles/settings";

export const metadata: Metadata = { title: "Register an agent — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Taking somebody on directly, without asking them to apply so that the same
 * admin can approve it a minute later. The account is created through the same
 * approval the queue uses, and comes back with a setup link to hand over.
 */
export default async function AdminRegisterAgentPage() {
  await requireAdmin();
  const config = await getAgentProgramConfig();

  return (
    <div className="max-w-xl">
      <PanelHeading
        title="Register an agent"
        subtitle="Creates the account and opens their store straight away — no application to approve."
      />
      <RegisterAgentForm setupFee={config.setupFee} />
    </div>
  );
}
