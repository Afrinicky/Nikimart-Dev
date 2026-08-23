import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgentPageHeading } from "@/components/agent/AgentUi";
import { SupportTabs } from "@/components/agent/SupportTabs";
import { requireUser } from "@/lib/session";
import { getAgentProgramConfig } from "@/lib/settings";
import { getAgentForUser } from "@/lib/data-bundles/agents";

export const metadata: Metadata = { title: "Support — Agent — NikiMart" };
export const dynamic = "force-dynamic";

export default async function AgentSupportPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const program = await getAgentProgramConfig();

  return (
    <div className="space-y-5">
      <AgentPageHeading title="Support" subtitle="Get help with your account, orders and payouts." />
      <SupportTabs
        defaultName={user.name ?? ""}
        defaultPhone={agent.supportPhone}
        supportPhone={program.supportPhone}
        supportWhatsapp={program.supportWhatsapp}
        whatsappGroup={agent.whatsappGroup || program.whatsappGroup}
        setupFee={program.setupFee}
        withdrawalFee={program.withdrawalFee}
        minWithdrawal={program.minWithdrawal}
      />
    </div>
  );
}
