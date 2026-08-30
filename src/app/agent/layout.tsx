import { redirect } from "next/navigation";
import { ExternalLink, Store } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { AgentRail, AgentSidebar } from "@/components/agent/AgentNav";
import { AgentCode } from "@/components/agent/AgentCode";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getAgentProgramConfig, getDataStoreConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * The agent platform shell.
 *
 * Membership, not role, is what gates this: an agent is any signed-in user with
 * a DataAgent row, so someone can be a customer and an agent at once without a
 * `/become-an-agent` sits outside this shell — it is where people go *before*
 * they have an account to show.
 */
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [agent, program, store] = await Promise.all([
    getAgentForUser(user.id),
    getAgentProgramConfig(),
    getDataStoreConfig(),
  ]);

  if (!agent) redirect("/become-an-agent");

  const suspended = agent.status !== "active";

  return (
    <div className="niki-gradient-hero min-h-[calc(100vh-4rem)] pb-12">
      <Container className="pt-6">
        {/* Store identity + the shortcut to the public storefront. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-niki-gold ring-1 ring-white/15">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-lg font-bold text-white sm:text-xl">
                {agent.storeName}
              </p>
              <p className="text-xs text-white/50">Agent platform · Nickimart Data</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AgentCode code={agent.code} />
            <ActionLink
              href={`/store/${agent.slug}`}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white ring-1 ring-white/15 hover:bg-white/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View my store
            </ActionLink>
          </div>
        </div>

        {suspended ? (
          <p className="animate-fade-up mt-5 rounded-2xl bg-niki-danger/15 px-4 py-3 text-sm font-medium text-white ring-1 ring-niki-danger/40">
            Your agent account is suspended. Your storefront is closed and you aren&apos;t earning
            commission. Please contact support to sort it out.
          </p>
        ) : null}

        <div className="mt-5 lg:hidden">
          <AgentRail afaEnabled={store.afaEnabled} />
        </div>

        <div className="mt-6 gap-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <AgentSidebar afaEnabled={store.afaEnabled} />
            <p className="mt-6 px-4 text-[11px] leading-relaxed text-white/35">
              Commission is credited once a bundle is delivered. Withdrawals go to MoMo, minus a{" "}
              {program.withdrawalFee > 0 ? `GH₵${program.withdrawalFee.toFixed(2)} ` : ""}fee.
            </p>
          </aside>

          {/* The content sits on a light card so the existing page components
              (tables, forms, stat tiles) read exactly as they do elsewhere. */}
          <main className="animate-fade-up min-w-0 rounded-3xl bg-niki-surface p-4 shadow-2xl shadow-black/20 sm:p-6">
            {children}
          </main>
        </div>
      </Container>
    </div>
  );
}
