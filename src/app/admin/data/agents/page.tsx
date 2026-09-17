import type { Metadata } from "next";
import { Pencil, Users } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { formatMoney } from "@/lib/format";
import { getAgentProgramConfig } from "@/lib/data-bundles/settings";
import { listAgents } from "@/lib/data-bundles/agents";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Agents — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

/** The roster: who's selling, what they've sold, and what they're owed. */
export default async function AdminAgentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ removed?: string }>;
}) {
  const { removed } = (await searchParams) ?? {};
  const [agents, program] = await Promise.all([listAgents(), getAgentProgramConfig()]);

  const totals = agents.reduce(
    (acc, a) => ({
      sales: acc.sales + a.totalSales,
      commission: acc.commission + a.totalCommission,
      owed: acc.owed + Math.max(0, a.balance),
      outstanding: acc.outstanding + Math.max(0, -a.balance),
    }),
    { sales: 0, commission: 0, owed: 0, outstanding: 0 },
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
        {[
          { label: "Agents", value: String(agents.length) },
          { label: "Agent sales", value: formatMoney(totals.sales) },
          { label: "Commission earned", value: formatMoney(totals.commission) },
          { label: "Balances owed", value: formatMoney(totals.owed) },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45 sm:text-xs">
              {t.label}
            </p>
            <p className="mt-2 font-figures text-xl font-bold text-niki-ink sm:text-2xl">{t.value}</p>
          </div>
        ))}
      </div>

      {totals.outstanding > 0 ? (
        <p className="mt-3 text-xs text-niki-ink/50">
          {formatMoney(totals.outstanding)} of setup fees is still clearing across all agents.
        </p>
      ) : null}

      <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <PanelHeading title="Active agents" subtitle="Everyone reselling under their own storefront." />
        {agents.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
              <Users className="h-5 w-5" />
            </span>
            <p className="mt-3 font-display font-bold text-niki-ink">No agents yet</p>
            <p className="mt-1 text-sm text-niki-ink/55">
              Share a registration link to start recruiting. Set an agent price on your bundles
              first, or there&apos;ll be nothing for them to sell.
            </p>
          </div>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[880px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-niki-surface/70">
                  <th className={`${th} rounded-l-lg`}>Store</th>
                  <th className={th}>Code</th>
                  <th className={th}>Contact</th>
                  <th className={th}>Orders</th>
                  <th className={th}>Sales</th>
                  <th className={th}>Commission</th>
                  <th className={th}>Balance</th>
                  <th className={th}>Status</th>
                  <th className={`${th} rounded-r-lg`}>Manage</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                  >
                    <td className={td}>
                      <ActionLink
                        href={`/admin/data/agents/${a.id}`}
                        className="font-semibold text-niki-trust hover:underline"
                      >
                        {a.storeName}
                      </ActionLink>
                      <p className="font-mono text-[11px] text-niki-ink/40">/store/{a.slug}</p>
                    </td>
                    <td className={`${td} font-mono text-xs text-niki-ink/70`}>{a.code}</td>
                    <td className={`${td} text-xs text-niki-ink/65`}>
                      {a.user?.name ?? "—"}
                      <br />
                      <span className="font-mono">{a.supportPhone || a.user?.phone || "—"}</span>
                      {!a.canSignIn ? (
                        <span className="mt-1 flex w-fit items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Never signed in
                        </span>
                      ) : null}
                    </td>
                    <td className={`${td} text-niki-ink/70`}>{a.orderCount}</td>
                    <td className={`${td} font-semibold text-niki-ink`}>
                      {formatMoney(a.totalSales)}
                    </td>
                    <td className={`${td} text-niki-ink/70`}>{formatMoney(a.totalCommission)}</td>
                    <td
                      className={cn(
                        td,
                        "font-semibold",
                        a.balance < 0 ? "text-niki-danger" : "text-niki-success",
                      )}
                    >
                      {formatMoney(a.balance)}
                    </td>
                    <td className={td}>
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase",
                          a.status === "active"
                            ? "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30"
                            : "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
                        )}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className={td}>
                      <ActionLink
                        href={`/admin/data/agents/${a.id}`}
                        className="niki-focus inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-niki-ink/75 ring-1 ring-niki-edge hover:bg-niki-black/5"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </ActionLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
