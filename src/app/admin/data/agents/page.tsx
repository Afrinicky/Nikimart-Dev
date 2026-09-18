import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AgentRoster } from "@/components/admin/AgentRoster";
import { formatMoney } from "@/lib/format";
import { getAgentProgramConfig } from "@/lib/data-bundles/settings";
import { listAgents } from "@/lib/data-bundles/agents";
import { paymentModeLabel } from "@/lib/data-bundles/payment-mode";

export const metadata: Metadata = { title: "Agents — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Agent management: the whole network at a glance, and one door into each
 * agent.
 *
 * What was here before was a wide table of nine columns, most of which nobody
 * reads, with an Edit link at the end of a horizontal scroll. The numbers that
 * matter for the network sit at the top; everything that matters about one
 * agent is in that agent's own window, one click away.
 */
export default async function AdminAgentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ removed?: string }>;
}) {
  const { removed } = (await searchParams) ?? {};
  const [agents, program] = await Promise.all([listAgents(), getAgentProgramConfig()]);

  const totals = agents.reduce(
    (acc, a) => ({
      active: acc.active + (a.status === "active" ? 1 : 0),
      sales: acc.sales + a.totalSales,
      commission: acc.commission + a.totalCommission,
      owed: acc.owed + Math.max(0, a.balance),
      outstanding: acc.outstanding + Math.max(0, -a.balance),
      pending: acc.pending + (a.canSignIn ? 0 : 1),
    }),
    { active: 0, sales: 0, commission: 0, owed: 0, outstanding: 0, pending: 0 },
  );

  return (
    <div>
      {!program.enabled ? (
        <p className="mb-5 rounded-xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          Agent signup is switched off. Existing agents keep trading; nobody new can join. Turn it
          back on under Programme settings.
        </p>
      ) : null}

      {removed ? (
        <p className="animate-fade-up mb-5 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/30">
          Storefront removed. The person keeps their Nickimart account.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile
          label="Agents"
          value={String(agents.length)}
          note={`${totals.active} active`}
        />
        <Tile label="Agent sales" value={formatMoney(totals.sales)} note={`${agents.length ? "across the network" : "nothing yet"}`} />
        <Tile
          label="Commission earned"
          value={formatMoney(totals.commission)}
          note="by agents, on delivered orders"
        />
        <Tile
          label="Balances owed"
          value={formatMoney(totals.owed)}
          note={
            totals.outstanding > 0
              ? `${formatMoney(totals.outstanding)} of fees still clearing`
              : "nothing outstanding"
          }
        />
      </div>

      <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <PanelHeading
          title="Agents"
          subtitle={`Registration: ${paymentModeLabel(program.paymentMode).toLowerCase()}${
            program.perAgentOverrides ? ", exceptions allowed per agent" : ", no exceptions"
          }.`}
        >
          <ActionLink
            href="/admin/data/agents/new"
            className="flex items-center gap-1.5 rounded-lg bg-niki-black px-3.5 py-2 text-xs font-semibold text-white hover:bg-niki-black-mute"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Register an agent
          </ActionLink>
        </PanelHeading>

        {totals.pending > 0 ? (
          <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
            {totals.pending} {totals.pending === 1 ? "agent has" : "agents have"} never signed in —
            their setup link can be reissued from their window.
          </p>
        ) : null}

        <AgentRoster
          agents={agents.map((a) => ({
            id: a.id,
            storeName: a.storeName,
            slug: a.slug,
            code: a.code,
            ownerName: a.user?.name ?? "",
            phone: a.supportPhone || a.user?.phone || "",
            status: a.status,
            balance: a.balance,
            totalSales: a.totalSales,
            orderCount: a.orderCount,
            canSignIn: a.canSignIn,
          }))}
        />
      </section>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45 sm:text-xs">
        {label}
      </p>
      <p className="mt-2 font-figures text-xl font-bold text-niki-ink sm:text-2xl">{value}</p>
      {note ? <p className="mt-1 truncate text-[11px] text-niki-ink/45">{note}</p> : null}
    </div>
  );
}
