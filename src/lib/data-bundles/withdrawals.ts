import "server-only";
import { dataDb } from "@/lib/data-db";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { getAgentUser } from "@/lib/data-bundles/user-link";
import {
  withdrawalNetworkWhere,
  withdrawalSearchWhere,
  withdrawalStatusWhere,
} from "@/lib/data-bundles/withdrawal-filters";

/**
 * Reads for the payout queue.
 *
 * A withdrawal is the one place Nickimart's money leaves the platform by hand:
 * somebody reads a number off a screen and sends it on MoMo. So the list is
 * built like the orders list — searchable, filterable, paged — and every row
 * opens onto everything needed to make that transfer and to answer for it
 * afterwards.
 */

export interface WithdrawalListOptions {
  status?: string;
  network?: string;
  query?: string;
  page?: number;
  perPage?: number;
}

export async function getWithdrawals(opts: WithdrawalListOptions = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = opts.perPage ?? 25;
  const where = {
    ...withdrawalStatusWhere(opts.status),
    ...withdrawalNetworkWhere(opts.network),
    ...withdrawalSearchWhere(opts.query),
  };

  try {
    const [rows, total] = await Promise.all([
      dataDb.dataAgentWithdrawal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          agent: { select: { id: true, storeName: true, code: true, balance: true, status: true } },
        },
      }),
      dataDb.dataAgentWithdrawal.count({ where }),
    ]);
    return { rows, total };
  } catch {
    return { rows: [], total: 0 };
  }
}

export interface WithdrawalTotals {
  /** Requested and not yet sent. */
  pending: number;
  pendingCount: number;
  /** Actually paid out, all time. */
  paid: number;
  paidCount: number;
  rejected: number;
  rejectedCount: number;
  /** Fees Nickimart kept on the payouts it sent. */
  feesKept: number;
}

export async function getWithdrawalTotals(): Promise<WithdrawalTotals> {
  const empty: WithdrawalTotals = {
    pending: 0,
    pendingCount: 0,
    paid: 0,
    paidCount: 0,
    rejected: 0,
    rejectedCount: 0,
    feesKept: 0,
  };
  try {
    const rows = await dataDb.dataAgentWithdrawal.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { amount: true, fee: true },
    });
    const totals = { ...empty };
    for (const r of rows) {
      const amount = round2(r._sum.amount ?? 0);
      if (r.status === "pending") {
        totals.pending = amount;
        totals.pendingCount = r._count._all;
      } else if (r.status === "processed") {
        totals.paid = amount;
        totals.paidCount = r._count._all;
        totals.feesKept = round2(r._sum.fee ?? 0);
      } else if (r.status === "rejected") {
        totals.rejected = amount;
        totals.rejectedCount = r._count._all;
      }
    }
    return totals;
  } catch {
    return empty;
  }
}

/** One withdrawal, with the agent and the person behind it. */
export async function getWithdrawal(id: string) {
  const row = await dataDb.dataAgentWithdrawal
    .findUnique({
      where: { id },
      include: {
        agent: {
          select: {
            id: true,
            storeName: true,
            code: true,
            slug: true,
            balance: true,
            status: true,
            userId: true,
            supportPhone: true,
          },
        },
      },
    })
    .catch(() => null);
  if (!row) return null;

  const [user, history] = await Promise.all([
    getAgentUser(row.agent.userId),
    // Their other payouts, for the "is this the third this week?" question
    // that decides whether a request is routine or worth a second look.
    dataDb.dataAgentWithdrawal
      .findMany({
        where: { agentId: row.agentId, id: { not: row.id } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, amount: true, status: true, createdAt: true },
      })
      .catch(() => []),
  ]);

  return { ...row, user, history };
}
