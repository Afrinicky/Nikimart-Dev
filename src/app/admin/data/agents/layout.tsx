import { Users } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { AGENT_MODULE_TABS, pendingApplicationCount } from "@/lib/data-bundles/agent-module";

export const dynamic = "force-dynamic";

/**
 * Agent management.
 *
 * Everything about running the agent network, in one module: who is selling,
 * who wants to, the links that let them in, what they are owed, what they are
 * asking, and the rules the whole programme runs on. They used to be six
 * unrelated entries in the console's top-level list, which meant the settings
 * that decide what an agent is charged sat under "Store settings" while the
 * agents themselves sat somewhere else entirely.
 *
 * Withdrawals keeps its own place in the sidebar as well as its tab here: it is
 * a daily money task, and a daily task should not be two clicks deep.
 */
export default async function AgentsModuleLayout({ children }: { children: React.ReactNode }) {
  const waiting = await pendingApplicationCount();

  return (
    <Container className="py-8">
      <ModuleHeader
        title="Agent management"
        subtitle="Your reseller network: accounts, applications, payouts and the programme's rules."
        icon={Users}
      />
      <div className="mt-5">
        <ModuleTabs tabs={AGENT_MODULE_TABS(waiting)} />
      </div>
      <div className="mt-6">{children}</div>
    </Container>
  );
}
