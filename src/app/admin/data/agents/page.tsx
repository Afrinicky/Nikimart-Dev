import type { Metadata } from "next";
import { Inbox, Pencil, Users } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { formatMoney } from "@/lib/format";
import { getAgentProgramConfig } from "@/lib/settings";
import { listAgents } from "@/lib/data-bundles/agents";
import { ApplicationReview } from "@/components/admin/ApplicationReview";
import { formatWhen } from "@/components/agent/AgentUi";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Agents — Admin — NikiMart" };
export const dynamic = "force-dynamic";

/** The agent roster: who's selling, what they've sold, and what they're owed. */
export default async function AdminAgentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ removed?: string }>;
}) {
  const { removed } = (await searchParams) ?? {};
  const [agents, program, applications] = await Promise.all([
    listAgents(),
    getAgentProgramConfig(),
    prisma.dataAgentApplication
      .findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 50 })
      .catch(() => []),
  ]);

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
          <div key={t.label} className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
              {t.label}
            </p>
            <p className="mt-2 font-figures text-xl font-bold text-niki-ink sm:text-2xl">{t.value}</p>
          </div>
        ))}
      </div>

      {totals.outstanding > 0 ? (
        <p className="mt-4 text-xs text-niki-ink/50">
          {formatMoney(totals.outstanding)} of setup fees is still clearing across all agents.
        </p>
      ) : null}

      {/* Applications waiting. Above the roster because it's the only thing
          here that needs a decision. */}
      <section className="mt-6">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-bold text-niki-ink">Applications</h2>
          {applications.length > 0 ? (
            <span className="rounded-full bg-niki-orange px-2.5 py-0.5 text-[11px] font-bold text-white">
              {applications.length} waiting
            </span>
          ) : null}
        </div>

        {applications.length === 0 ? (
          <div className="mt-3 rounded-2xl bg-white px-4 py-10 text-center ring-1 ring-niki-edge">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
              <Inbox className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm text-niki-ink/55">
              Nothing waiting. Applications from{" "}
              <span className="font-mono">/become-an-agent</span> land here.
            </p>
          </div>
        ) : (
          <div className="stagger-children mt-3 space-y-3">
            {applications.map((a) => (
              <article key={a.id} className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-niki-ink">{a.fullName}</p>
                    <p className="mt-0.5 text-sm text-niki-ink/65">
                      <a href={`tel:${a.phone}`} className="font-mono hover:text-niki-orange">
                        {a.phone}
                      </a>
                      {" · "}
                      <a href={`mailto:${a.email}`} className="hover:text-niki-orange">
                        {a.email}
                      </a>
                    </p>
                    <p className="mt-1 text-xs text-niki-ink/50">
                      Wants to trade as{" "}
                      <span className="font-semibold text-niki-ink/80">
                        {a.storeName || a.desiredSlug}
                      </span>{" "}
                      at{" "}
                      <span className="font-mono font-semibold text-niki-ink/70">
                        /store/{a.desiredSlug}
                      </span>
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-niki-ink/45">
                    {formatWhen(a.createdAt)}
                  </time>
                </div>

                {a.note ? (
                  <p className="mt-3 rounded-xl bg-niki-surface px-4 py-3 text-sm leading-relaxed text-niki-ink/70">
                    {a.note}
                  </p>
                ) : null}

                <div className="mt-4">
                  <ApplicationReview id={a.id} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {removed ? (
        <p className="animate-fade-up mt-6 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/30">
          Storefront removed. The person keeps their NikiMart account.
        </p>
      ) : null}

      <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">Active agents</h2>
      <section className="mt-3 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
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
                <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
                  <th className="py-2.5 pr-4 font-semibold">Store</th>
                  <th className="py-2.5 pr-4 font-semibold">Code</th>
                  <th className="py-2.5 pr-4 font-semibold">Contact</th>
                  <th className="py-2.5 pr-4 font-semibold">Orders</th>
                  <th className="py-2.5 pr-4 font-semibold">Sales</th>
                  <th className="py-2.5 pr-4 font-semibold">Commission</th>
                  <th className="py-2.5 pr-4 font-semibold">Balance</th>
                  <th className="py-2.5 pr-4 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-niki-edge">
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
                      {!a.canSignIn ? (
                        <span className="mt-1 flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Never signed in
                        </span>
                      ) : null}
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
                    <td className="py-3 pr-4">
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
                    <td className="py-3">
                      <ActionLink
                        href={`/admin/data/agents/${a.id}`}
                        className="niki-chip niki-focus inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-niki-ink/75"
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
    </Container>
  );
}
