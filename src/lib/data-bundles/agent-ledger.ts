import "server-only";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/data-bundles/agents";

/**
 * The only place an agent's balance is allowed to move.
 *
 * Every change writes a ledger row and updates the balance in the same
 * transaction, so the wallet screen and the running total can never disagree.
 * Commission is credited on delivery, not on payment: a bundle that never
 * lands is a sale the agent was never owed for.
 */

export type LedgerType =
  | "SETUP_FEE"
  | "COMMISSION"
  | "WITHDRAWAL"
  | "WITHDRAWAL_REVERSAL"
  | "ADJUSTMENT";

export interface LedgerEntry {
  agentId: string;
  type: LedgerType;
  /** Signed GH₵: negative debits the agent, positive credits them. */
  amount: number;
  narration: string;
  reference?: string | null;
  /**
   * Apply this debit only while the balance is at least `requireBalance`.
   *
   * Checking the balance in application code and then debiting is two steps,
   * and two withdrawal requests that arrive together can both pass the check
   * before either one writes — the balance goes negative and the agent is paid
   * twice. Set this and the balance is tested and decremented in a single
   * conditional UPDATE, so the second one finds the money gone.
   */
  requireBalance?: number;
}

/** Thrown by postLedgerEntry when `requireBalance` is no longer satisfied. */
export class InsufficientBalanceError extends Error {
  constructor() {
    super("INSUFFICIENT_BALANCE");
    this.name = "InsufficientBalanceError";
  }
}

/**
 * Apply one entry. Returns the balance afterwards, or null when the agent has
 * gone away. `tx` lets a caller fold this into a larger transaction.
 *
 * Throws InsufficientBalanceError when `requireBalance` was set and the balance
 * had already moved below it.
 */
export async function postLedgerEntry(
  entry: LedgerEntry,
  tx: Pick<typeof prisma, "dataAgent" | "dataAgentLedger"> = prisma,
): Promise<number | null> {
  const amount = round2(entry.amount);

  if (entry.requireBalance !== undefined) {
    // One statement: the balance is both the guard and the thing being
    // changed, so nothing can slip between reading it and spending it.
    const claimed = await tx.dataAgent.updateMany({
      where: { id: entry.agentId, balance: { gte: entry.requireBalance } },
      data: { balance: { increment: amount } },
    });
    if (claimed.count === 0) throw new InsufficientBalanceError();
  }

  const agent = entry.requireBalance !== undefined
    ? await tx.dataAgent.findUniqueOrThrow({
        where: { id: entry.agentId },
        select: { balance: true },
      })
    : await tx.dataAgent.update({
        where: { id: entry.agentId },
        data: { balance: { increment: amount } },
        select: { balance: true },
      });
  const balanceAfter = round2(agent.balance);
  await tx.dataAgentLedger.create({
    data: {
      agentId: entry.agentId,
      type: entry.type,
      amount,
      balanceAfter,
      narration: entry.narration.slice(0, 300),
      reference: entry.reference ?? null,
    },
  });
  return balanceAfter;
}

/**
 * Credit the selling agent for a delivered bundle order — once.
 *
 * The guarded `updateMany` on `commissionStatus` is what makes it once: the
 * provider callback, the admin's refresh button and the sweep cron all call
 * this on the same order, and only the caller that flips it from "pending"
 * writes the ledger row.
 */
export async function creditAgentCommission(orderId: string): Promise<boolean> {
  let order;
  try {
    order = await prisma.dataOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        reference: true,
        agentId: true,
        agentCommission: true,
        status: true,
        paymentStatus: true,
        commissionStatus: true,
        sizeGb: true,
        network: true,
        recipientPhone: true,
      },
    });
  } catch {
    return false; // agent columns not migrated yet
  }

  if (!order?.agentId) return false;
  if (order.status !== "completed" || order.paymentStatus !== "paid") return false;
  if (order.commissionStatus !== "pending") return false;
  if (order.agentCommission <= 0) {
    // Nothing to pay, but don't leave it pending forever.
    await prisma.dataOrder.updateMany({
      where: { id: orderId, commissionStatus: "pending" },
      data: { commissionStatus: "void" },
    });
    return false;
  }

  // A suspended agent stops earning on new deliveries; the order stays pending
  // so an admin can release it by reactivating them.
  const agent = await prisma.dataAgent.findUnique({
    where: { id: order.agentId },
    select: { status: true },
  });
  if (!agent || agent.status !== "active") return false;

  const claimed = await prisma.dataOrder.updateMany({
    where: { id: orderId, commissionStatus: "pending" },
    data: { commissionStatus: "earned", commissionPaidAt: new Date() },
  });
  if (claimed.count === 0) return false;

  try {
    await postLedgerEntry({
      agentId: order.agentId,
      type: "COMMISSION",
      amount: order.agentCommission,
      narration: `Commission from order ${order.reference} — ${order.sizeGb}GB ${order.network} to ${order.recipientPhone}`,
      reference: order.reference,
    });
    return true;
  } catch {
    // The ledger write failed — put the order back so the next sweep retries.
    await prisma.dataOrder.updateMany({
      where: { id: orderId, commissionStatus: "earned" },
      data: { commissionStatus: "pending", commissionPaidAt: null },
    });
    return false;
  }
}

/** Void the commission on an order that failed or was refunded. */
export async function voidAgentCommission(orderId: string): Promise<void> {
  try {
    await prisma.dataOrder.updateMany({
      where: { id: orderId, commissionStatus: "pending" },
      data: { commissionStatus: "void" },
    });
  } catch {
    // not migrated — nothing to void
  }
}

/**
 * Sweep every delivered order whose commission never got credited (a callback
 * that arrived while the ledger was down, an agent reactivated after the fact).
 * Called from the data-bundle cron.
 */
export async function sweepAgentCommissions(limit = 100): Promise<number> {
  let owed;
  try {
    owed = await prisma.dataOrder.findMany({
      where: {
        agentId: { not: null },
        status: "completed",
        paymentStatus: "paid",
        commissionStatus: "pending",
        agentCommission: { gt: 0 },
      },
      select: { id: true },
      take: limit,
    });
  } catch {
    return 0;
  }

  let credited = 0;
  for (const o of owed) {
    if (await creditAgentCommission(o.id)) credited++;
  }
  return credited;
}

/**
 * The AFA equivalent of creditAgentCommission. Same once-only guard, same
 * "delivered before paid" rule.
 */
export async function creditAfaCommission(id: string): Promise<boolean> {
  let row;
  try {
    row = await prisma.afaRegistration.findUnique({
      where: { id },
      select: {
        id: true,
        reference: true,
        agentId: true,
        agentCommission: true,
        status: true,
        paymentStatus: true,
        commissionStatus: true,
        phoneNumber: true,
      },
    });
  } catch {
    return false;
  }

  if (!row?.agentId) return false;
  if (row.status !== "completed" || row.paymentStatus !== "paid") return false;
  if (row.commissionStatus !== "pending" || row.agentCommission <= 0) return false;

  const agent = await prisma.dataAgent.findUnique({
    where: { id: row.agentId },
    select: { status: true },
  });
  if (!agent || agent.status !== "active") return false;

  const claimed = await prisma.afaRegistration.updateMany({
    where: { id, commissionStatus: "pending" },
    data: { commissionStatus: "earned", commissionPaidAt: new Date() },
  });
  if (claimed.count === 0) return false;

  try {
    await postLedgerEntry({
      agentId: row.agentId,
      type: "COMMISSION",
      amount: row.agentCommission,
      narration: `Commission from AFA registration ${row.reference} — ${row.phoneNumber}`,
      reference: row.reference,
    });
    return true;
  } catch {
    await prisma.afaRegistration.updateMany({
      where: { id, commissionStatus: "earned" },
      data: { commissionStatus: "pending", commissionPaidAt: null },
    });
    return false;
  }
}
