import type { Metadata } from "next";
import { Suspense } from "react";
import { Banknote, ChevronRight, Users } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { TableFilters } from "@/components/admin/TableFilters";
import { TablePager } from "@/components/admin/TablePager";
import { AGENT_MODULE_TABS, pendingApplicationCount } from "@/lib/data-bundles/agent-module";
import { ActionLink } from "@/components/ui/motion";
import { formatWhen } from "@/components/agent/AgentUi";
import { formatMoney } from "@/lib/format";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { getWithdrawals, getWithdrawalTotals } from "@/lib/data-bundles/withdrawals";
import {
  WITHDRAWAL_NETWORK_OPTIONS,
  WITHDRAWAL_STATUS_OPTIONS,
  withdrawalStatusFilter,
} from "@/lib/data-bundles/withdrawal-filters";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Withdrawals — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const TONES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  processed: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  rejected: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
};

const LABELS: Record<string, string> = {
  pending: "Waiting",
  processed: "Sent",
  rejected: "Rejected",
};

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

function Tile({
  label,
  value,
  note,
  href,
  tone = "ink",
}: {
  label: string;
  value: string;
  note?: string;
  href: string;
  tone?: "ink" | "success" | "danger" | "orange";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    danger: "text-niki-danger",
    orange: "text-niki-orange",
  } as const;
  return (
    <ActionLink
      href={href}
      className="niki-focus block rounded-2xl bg-white p-5 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45 sm:text-xs">
        {label}
      </p>
      <p className={`mt-2 font-figures text-xl font-bold sm:text-2xl ${tones[tone]}`}>{value}</p>
      {note ? <p className="mt-1 truncate text-[11px] text-niki-ink/45">{note}</p> : null}
    </ActionLink>
  );
}

/**
 * The payout queue.
 *
 * The money already left the agent's balance when they asked for it, so
 * nothing here moves money — it records what happened to a MoMo transfer
 * somebody made by hand. That makes it a ledger as much as a queue, which is
 * why it is now searchable and filterable across every payout ever made rather
 * than a list of the ones still waiting: the question asked of it most often
 * is "did we pay this person, and when".
 */
export default async function AdminWithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    network?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  const params = await searchParams;
  // Defaulting to what is waiting: that is the job, and an unfiltered list of
  // everything ever paid buries it.
  const status = withdrawalStatusFilter(params.status ?? "pending").value;
  const network = WITHDRAWAL_NETWORK_OPTIONS.some((n) => n.value === params.network)
    ? params.network!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [{ rows, total }, totals, waiting] = await Promise.all([
    getWithdrawals({ status, network, query, page, perPage }),
    getWithdrawalTotals(),
    pendingApplicationCount(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

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

      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile
          label="Waiting to be sent"
          value={formatMoney(totals.pending)}
          note={`${totals.pendingCount} ${totals.pendingCount === 1 ? "request" : "requests"}`}
          href="/admin/data/withdrawals?status=pending"
          tone={totals.pending > 0 ? "orange" : "ink"}
        />
        <Tile
          label="Paid to agents"
          value={formatMoney(totals.paid)}
          note={`${totals.paidCount} ${totals.paidCount === 1 ? "payout" : "payouts"} sent`}
          href="/admin/data/withdrawals?status=processed"
          tone="success"
        />
        <Tile
          label="Fees kept"
          value={formatMoney(totals.feesKept)}
          note="Charged on the payouts sent"
          href="/admin/data/withdrawals?status=processed"
        />
        <Tile
          label="Rejected"
          value={formatMoney(totals.rejected)}
          note={`${totals.rejectedCount} put back on balances`}
          href="/admin/data/withdrawals?status=rejected"
          tone={totals.rejectedCount > 0 ? "danger" : "ink"}
        />
      </div>

      <div className="mt-6">
        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={query}
            searchPlaceholder="Search by MoMo number, name, store or agent code…"
            searchLabel="Search withdrawals"
            filters={[
              { key: "status", label: "Filter by status", value: status, options: WITHDRAWAL_STATUS_OPTIONS },
              { key: "network", label: "Filter by network", value: network, options: WITHDRAWAL_NETWORK_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="withdrawals"
          />
        </Suspense>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
              <Banknote className="h-5 w-5" />
            </span>
            <p className="mt-3 font-display font-bold text-niki-ink">Nothing here</p>
            <p className="mt-1 text-sm text-niki-ink/55">
              {query || status !== "all"
                ? "No payout matches those filters."
                : "No agent has asked for a payout yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-niki-surface/70">
                    <th className={`${th} rounded-l-lg`}>Requested</th>
                    <th className={th}>Agent</th>
                    <th className={th}>Pay to</th>
                    <th className={th}>Name on account</th>
                    <th className={`${th} text-right`}>Amount</th>
                    <th className={`${th} text-right`}>Fee</th>
                    <th className={th}>Status</th>
                    <th className={`${th} rounded-r-lg`}>Handled</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => (
                    <tr
                      key={w.id}
                      className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                    >
                      <td className={td}>
                        <ActionLink
                          href={`/admin/data/withdrawals/${w.id}`}
                          className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-niki-trust hover:underline"
                        >
                          {formatWhen(w.createdAt)}
                          <ChevronRight className="h-3 w-3" />
                        </ActionLink>
                      </td>
                      <td className={td}>
                        <ActionLink
                          href={`/admin/data/agents/${w.agent.id}`}
                          className="font-semibold text-niki-ink hover:text-niki-orange"
                        >
                          {w.agent.storeName}
                        </ActionLink>
                        <p className="font-mono text-[11px] text-niki-ink/40">{w.agent.code}</p>
                      </td>
                      <td className={td}>
                        <span className="font-mono text-niki-ink/75">{w.momoPhone}</span>
                        <p className="text-[11px] text-niki-ink/45">{w.momoNetwork}</p>
                      </td>
                      <td className={`${td} text-niki-ink/70`}>{w.momoName}</td>
                      <td className={`${td} text-right font-figures font-bold text-niki-ink`}>
                        {formatMoney(w.amount)}
                      </td>
                      <td className={`${td} text-right text-niki-ink/55`}>
                        {w.fee > 0 ? formatMoney(w.fee) : "—"}
                      </td>
                      <td className={td}>
                        <span
                          className={cn(
                            "inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase",
                            TONES[w.status],
                          )}
                        >
                          {LABELS[w.status] ?? w.status}
                        </span>
                      </td>
                      <td className={`${td} text-xs text-niki-ink/55`}>
                        {w.processedAt ? (
                          <>
                            {formatWhen(w.processedAt)}
                            {w.processedBy ? (
                              <p className="text-[11px] text-niki-ink/40">by {w.processedBy}</p>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Suspense fallback={<div className="h-12" />}>
              <TablePager page={page} pageCount={pageCount} perPage={perPage} />
            </Suspense>
          </>
        )}
      </section>
    </Container>
  );
}
