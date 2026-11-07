import "server-only";
import { dataDb } from "@/lib/data-db";
import { round2 } from "@/lib/data-bundles/agent-pricing";

/**
 * Reads for the refunds screen.
 *
 * A refund was the one movement of money with nowhere to look it up. A wallet
 * credit is traceable through the ledger, but a refund owed to a buyer on MoMo
 * has no ledger row by definition — the cedis leave by hand — and the status
 * flip on the order said only that one had happened, never where it went or
 * whether it had landed. So this reads the refund rows themselves, the same
 * way the payout queue reads withdrawals: filterable, paged, and totalled by
 * the only distinction that matters operationally — sent, or still owed.
 */

export const REFUND_DESTINATION_OPTIONS = [
  { value: "all", label: "Everywhere" },
  { value: "WALLET", label: "Agent wallet" },
  { value: "BUYER_MOMO", label: "Buyer mobile money" },
] as const;

export const REFUND_STATUS_OPTIONS = [
  { value: "all", label: "Any state" },
  { value: "pending", label: "Awaiting transfer" },
  { value: "settled", label: "Settled" },
] as const;

export const REFUND_DESTINATION_LABELS: Record<string, string> = {
  WALLET: "Agent wallet",
  BUYER_MOMO: "Buyer mobile money",
};

export interface RefundListOptions {
  destination?: string;
  status?: string;
  /** Days back from now, or 0 for everything. */
  days?: number;
  query?: string;
  page?: number;
  perPage?: number;
}

export interface RefundRow {
  id: string;
  reference: string;
  amount: number;
  destination: string;
  status: string;
  momoPhone: string;
  momoName: string;
  momoNetwork: string;
  requestedBy: string;
  requestedByName: string;
  note: string;
  paidBy: string | null;
  paidAt: Date | null;
  createdAt: Date;
  agentName: string;
  agentCode: string;
  network: string;
  sizeGb: number;
  recipientPhone: string;
  buyerPhone: string;
}

export interface RefundTotals {
  /** Credited to agent wallets in the window. */
  toWallets: number;
  toWalletsCount: number;
  /** Sent to buyers on MoMo in the window. */
  toBuyers: number;
  toBuyersCount: number;
  /** Owed to buyers and not yet transferred — all time, not just the window. */
  owed: number;
  owedCount: number;
}

function whereFrom(opts: RefundListOptions) {
  const destination =
    opts.destination === "WALLET" || opts.destination === "BUYER_MOMO"
      ? { destination: opts.destination }
      : {};
  const status =
    opts.status === "pending" || opts.status === "settled" ? { status: opts.status } : {};
  const within =
    opts.days && opts.days > 0
      ? { createdAt: { gte: new Date(Date.now() - opts.days * 86_400_000) } }
      : {};
  const q = (opts.query ?? "").trim();
  const search = q
    ? {
        OR: [
          { reference: { contains: q, mode: "insensitive" as const } },
          { momoPhone: { contains: q } },
          { momoName: { contains: q, mode: "insensitive" as const } },
          { agent: { is: { storeName: { contains: q, mode: "insensitive" as const } } } },
          { agent: { is: { code: { contains: q, mode: "insensitive" as const } } } },
          { order: { is: { recipientPhone: { contains: q } } } },
        ],
      }
    : {};
  return { ...destination, ...status, ...within, ...search };
}

export async function getOrderRefunds(
  opts: RefundListOptions = {},
): Promise<{ rows: RefundRow[]; total: number; available: boolean }> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = opts.perPage ?? 25;
  const where = whereFrom(opts);

  try {
    const [rows, total] = await Promise.all([
      dataDb.dataOrderRefund.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          agent: { select: { storeName: true, code: true } },
          order: {
            select: { network: true, sizeGb: true, recipientPhone: true, buyerPhone: true },
          },
        },
      }),
      dataDb.dataOrderRefund.count({ where }),
    ]);

    return {
      available: true,
      total,
      rows: rows.map((r) => ({
        id: r.id,
        reference: r.reference,
        amount: round2(r.amount),
        destination: r.destination,
        status: r.status,
        momoPhone: r.momoPhone,
        momoName: r.momoName,
        momoNetwork: r.momoNetwork,
        requestedBy: r.requestedBy,
        requestedByName: r.requestedByName,
        note: r.note,
        paidBy: r.paidBy,
        paidAt: r.paidAt,
        createdAt: r.createdAt,
        agentName: r.agent?.storeName ?? "Nickimart",
        agentCode: r.agent?.code ?? "",
        network: r.order?.network ?? "",
        sizeGb: r.order?.sizeGb ?? 0,
        recipientPhone: r.order?.recipientPhone ?? "",
        buyerPhone: r.order?.buyerPhone ?? "",
      })),
    };
  } catch {
    // Table not migrated on this database yet. An empty screen that says so is
    // the right failure; an error page is not.
    return { rows: [], total: 0, available: false };
  }
}

export async function getRefundTotals(days = 0): Promise<RefundTotals> {
  const empty: RefundTotals = {
    toWallets: 0,
    toWalletsCount: 0,
    toBuyers: 0,
    toBuyersCount: 0,
    owed: 0,
    owedCount: 0,
  };
  const within = days > 0 ? { createdAt: { gte: new Date(Date.now() - days * 86_400_000) } } : {};

  try {
    const [grouped, owed] = await Promise.all([
      dataDb.dataOrderRefund.groupBy({
        by: ["destination", "status"],
        where: within,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      // Outstanding is asked of every refund ever raised, not of the window:
      // money owed to a buyer from last month is still owed today.
      dataDb.dataOrderRefund.aggregate({
        where: { status: "pending" },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    const totals = { ...empty };
    for (const g of grouped) {
      const amount = round2(g._sum.amount ?? 0);
      if (g.destination === "WALLET") {
        totals.toWallets = round2(totals.toWallets + amount);
        totals.toWalletsCount += g._count._all;
      } else if (g.destination === "BUYER_MOMO" && g.status === "settled") {
        totals.toBuyers = round2(totals.toBuyers + amount);
        totals.toBuyersCount += g._count._all;
      }
    }
    totals.owed = round2(owed._sum.amount ?? 0);
    totals.owedCount = owed._count._all;
    return totals;
  } catch {
    return empty;
  }
}
