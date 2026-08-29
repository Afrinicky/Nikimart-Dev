import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { formatWhen } from "@/components/agent/AgentUi";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/format";
import { processWithdrawal, rejectWithdrawal } from "@/lib/data-bundles/agent-admin-actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Withdrawals — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const TONES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  processed: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  rejected: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
};

/**
 * The payout queue.
 *
 * The money already left the agent's balance when they asked for it, so these
 * buttons record what happened to the MoMo transfer rather than moving money:
 * "processed" says it was sent, "rejected" puts it back.
 */
export default async function AdminWithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status = ["pending", "processed", "rejected"].includes(params.status ?? "")
    ? params.status!
    : "pending";

  const rows = await prisma.dataAgentWithdrawal
    .findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { agent: { select: { id: true, storeName: true, code: true, balance: true } } },
    })
    .catch(() => []);

  const pendingTotal = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Withdrawals</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            Agent commission payouts waiting to be sent by MoMo.
          </p>
        </div>
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {["pending", "processed", "rejected"].map((s) => (
            <ActionLink
              key={s}
              href={`/admin/data/withdrawals?status=${s}`}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-xs font-semibold capitalize",
                s === status
                  ? "bg-niki-orange text-white"
                  : "bg-white text-niki-ink/65 ring-1 ring-niki-edge hover:bg-niki-navy/5",
              )}
            >
              {s}
            </ActionLink>
          ))}
        </div>
      </div>

      {status === "pending" && rows.length > 0 ? (
        <p className="mt-5 rounded-2xl bg-niki-gold/10 px-5 py-4 text-sm text-niki-ink/70 ring-1 ring-niki-gold/40">
          <span className="font-semibold text-niki-ink">
            {formatMoney(pendingTotal)} across {rows.length}{" "}
            {rows.length === 1 ? "request" : "requests"}
          </span>{" "}
          to send. Transfer the amount on MoMo first, then mark it processed here.
        </p>
      ) : null}

      <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
              <Banknote className="h-5 w-5" />
            </span>
            <p className="mt-3 font-display font-bold text-niki-ink">
              Nothing {status === "pending" ? "waiting" : status}
            </p>
          </div>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
                  <th className="py-2.5 pr-4 font-semibold">Requested</th>
                  <th className="py-2.5 pr-4 font-semibold">Agent</th>
                  <th className="py-2.5 pr-4 font-semibold">Amount</th>
                  <th className="py-2.5 pr-4 font-semibold">Fee</th>
                  <th className="py-2.5 pr-4 font-semibold">Pay to</th>
                  <th className="py-2.5 pr-4 font-semibold">Name on account</th>
                  <th className="py-2.5 font-semibold">
                    {status === "pending" ? "Action" : "Outcome"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-niki-edge">
                {rows.map((w) => (
                  <tr key={w.id} className="transition-colors hover:bg-niki-surface/70">
                    <td className="py-3 pr-4 whitespace-nowrap text-xs text-niki-ink/55">
                      {formatWhen(w.createdAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <ActionLink
                        href={`/admin/data/agents/${w.agent.id}`}
                        className="font-semibold text-niki-trust hover:underline"
                      >
                        {w.agent.storeName}
                      </ActionLink>
                      <p className="font-mono text-[11px] text-niki-ink/40">{w.agent.code}</p>
                    </td>
                    <td className="py-3 pr-4 font-figures font-bold text-niki-ink">
                      {formatMoney(w.amount)}
                    </td>
                    <td className="py-3 pr-4 text-niki-ink/55">
                      {w.fee > 0 ? formatMoney(w.fee) : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-mono text-niki-ink/75">{w.momoPhone}</span>
                      <p className="text-[11px] text-niki-ink/45">{w.momoNetwork}</p>
                    </td>
                    <td className="py-3 pr-4 text-niki-ink/70">{w.momoName}</td>
                    <td className="py-3">
                      {w.status === "pending" ? (
                        <div className="flex gap-2">
                          <form action={processWithdrawal}>
                            <input type="hidden" name="withdrawalId" value={w.id} />
                            <button
                              type="submit"
                              className="niki-press rounded-full bg-niki-success px-3 py-1.5 text-[11px] font-bold text-white"
                            >
                              Mark sent
                            </button>
                          </form>
                          <form action={rejectWithdrawal}>
                            <input type="hidden" name="withdrawalId" value={w.id} />
                            <button
                              type="submit"
                              className="niki-press rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-niki-danger ring-1 ring-niki-danger/30"
                            >
                              Reject
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div>
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase",
                              TONES[w.status],
                            )}
                          >
                            {w.status}
                          </span>
                          {w.processedBy ? (
                            <p className="mt-1 text-[11px] text-niki-ink/45">by {w.processedBy}</p>
                          ) : null}
                        </div>
                      )}
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
