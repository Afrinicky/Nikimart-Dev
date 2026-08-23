import type { Metadata } from "next";
import { Users } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { formatMoney } from "@/lib/format";
import { getAgentProgramConfig } from "@/lib/settings";
import { listAgents } from "@/lib/data-bundles/agents";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Agents — Admin — NikiMart" };
export const dynamic = "force-dynamic";

/** The agent roster: who's selling, what they've sold, and what they're owed. */
export default async function AdminAgentsPage() {
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
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Agents</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            Everyone reselling NikiMart bundles under their own storefront.
          </p>
        </div>
        <ActionLink
          href="/admin/data/withdrawals"
          className="rounded-full bg-niki-navy px-4 py-2 text-xs font-semibold text-white"
        >
          Withdrawal queue
        </ActionLink>
      </div>

      {!program.enabled ? (
        <p className="mt-5 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          Agent signup is switched off. Existing agents keep trading; nobody new can join. Turn it
          back on under Store settings.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Agents", value: String(agents.length) },
          { label: "Agent sales", value: formatMoney(totals.sales) },
          { label: "Commission earned", value: formatMoney(totals.commission) },
          { label: "Balances owed", value: formatMoney(totals.owed) },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
            <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
              {t.label}
            </p>
            <p className="mt-2 font-display text-xl font-bold text-niki-ink sm:text-2xl">{t.value}</p>
          </div>
        ))}
      </div>

      {totals.outstanding > 0 ? (
        <p className="mt-4 text-xs text-niki-ink/50">
          {formatMoney(totals.outstanding)} of setup fees is still clearing across all agents.
        </p>
      ) : null}

      <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        {agents.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
              <Users className="h-5 w-5" />
            </span>
            <p className="mt-3 font-display font-bold text-niki-ink">No agents yet</p>
            <p className="mt-1 text-sm text-niki-ink/55">
              Share <span className="font-mono">/become-an-agent</span> to start recruiting. Set an
              agent price on your bundles first, or there&apos;ll be nothing for them to sell.
            </p>
          </div>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-black/5 text-[11px] uppercase tracking-wide text-niki-ink/45">
                  <th className="py-2.5 pr-4 font-semibold">Store</th>
                  <th className="py-2.5 pr-4 font-semibold">Code</th>
                  <th className="py-2.5 pr-4 font-semibold">Contact</th>
                  <th className="py-2.5 pr-4 font-semibold">Orders</th>
                  <th className="py-2.5 pr-4 font-semibold">Sales</th>
                  <th className="py-2.5 pr-4 font-semibold">Commission</th>
                  <th className="py-2.5 pr-4 font-semibold">Balance</th>
                  <th className="py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {agents.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-niki-surface/70">
                    <td className="py-3 pr-4">
                      <ActionLink
                        href={`/admin/data/agents/${a.id}`}
                        className="font-semibold text-niki-trust hover:underline"
                      >
                        {a.storeName}
                      </ActionLink>
                      <p className="font-mono text-[11px] text-niki-ink/40">/store/{a.slug}</p>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-niki-ink/70">{a.code}</td>
                    <td className="py-3 pr-4 text-xs text-niki-ink/65">
                      {a.user?.name ?? "—"}
                      <br />
                      <span className="font-mono">{a.supportPhone || a.user?.phone || "—"}</span>
                    </td>
                    <td className="py-3 pr-4 text-niki-ink/70">{a.orderCount}</td>
                    <td className="py-3 pr-4 font-semibold text-niki-ink">
                      {formatMoney(a.totalSales)}
                    </td>
                    <td className="py-3 pr-4 text-niki-ink/70">{formatMoney(a.totalCommission)}</td>
                    <td
                      className={cn(
                        "py-3 pr-4 font-semibold",
                        a.balance < 0 ? "text-niki-danger" : "text-niki-success",
                      )}
                    >
                      {formatMoney(a.balance)}
                    </td>
                    <td className="py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase",
                          a.status === "active"
                            ? "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30"
                            : "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
                        )}
                      >
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Container>
  );
}
