import "server-only";
import { dataDb } from "@/lib/data-db";
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
  | "SETUP_FEE_PAYMENT"
  | "COMMISSION"
  | "REFERRAL_L1"
  | "REFERRAL_L2"
  /** A recruiter's share of the registration fee their recruit paid. */
  | "REFERRAL_FEE_SHARE"
  | "TEAM_COMMISSION"
  /** A queued order cancelled — the customer's money back into the wallet. */
  | "ORDER_REFUND"
  /** The agent putting their own money into the wallet through Paystack. */
  | "WALLET_TOPUP"
  /** An order paid for out of the wallet instead of a card. */
  | "WALLET_ORDER"
  /** A recruit's registration fee, settled by the agent who brought them in. */
  | "SUBAGENT_FEE"
  /** Cedis from a reward an agent spent points on. */
  | "REWARD_PAYOUT"
  | "WITHDRAWAL"
  | "WITHDRAWAL_REVERSAL"
  | "ADJUSTMENT";

/**
 * The slice of the data client a ledger write needs. Written as a Pick so an
 * interactive transaction (`dataDb.$transaction(async (tx) => …)`) can be
 * passed straight in — a transaction client has the same model properties but
 * none of the connection-level ones.
 */
export type LedgerClient = Pick<typeof dataDb, "dataAgent" | "dataAgentLedger">;

export interface LedgerEntry {
  agentId: string;
  type: LedgerType;
  /** Signed GH₵: negative debits the agent, positive credits them. */
  amount: number;
  narration: string;
  reference?: string | null;
  /**
   * The agent whose activity produced this entry — the recruit whose fee was
   * paid, or the downline who made the sale. Only set on referral and team
   * earnings; it is what makes them traceable to their source.
   */
  sourceAgentId?: string | null;
  /** 1 for a direct recruit, 2 for a recruit's recruit. */
  referralLevel?: number | null;
  /**
   * A key unique to the thing being paid for, e.g. "TEAM_COMMISSION:<orderId>".
   * The database refuses a second row with the same key, so a credit that is
   * retried — by a sweep, a webhook, an admin — is paid exactly once however
   * many callers get as far as writing it. Callers that set this should catch
   * DuplicateLedgerEntryError and treat it as "already paid".
   */
  dedupeKey?: string | null;
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
 * Thrown when an entry carrying a `dedupeKey` has already been written. It
 * means the commission is paid, not that anything went wrong.
 */
export class DuplicateLedgerEntryError extends Error {
  constructor() {
    super("DUPLICATE_LEDGER_ENTRY");
    this.name = "DuplicateLedgerEntryError";
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
  tx: LedgerClient = dataDb,
): Promise<number | null> {
  const amount = round2(entry.amount);

  // Check the dedupe key before moving the balance. The unique index below is
  // the real guarantee; this is what keeps a duplicate from crediting the
  // balance and then failing on the ledger row, which would leave the two out
  // of step — the one thing this module exists to prevent.
  if (entry.dedupeKey) {
    const seen = await tx.dataAgentLedger.findUnique({
      where: { dedupeKey: entry.dedupeKey },
      select: { id: true },
    });
    if (seen) throw new DuplicateLedgerEntryError();
  }

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
  try {
    await tx.dataAgentLedger.create({
      data: {
        agentId: entry.agentId,
        type: entry.type,
        amount,
        balanceAfter,
        narration: entry.narration.slice(0, 300),
        reference: entry.reference ?? null,
        sourceAgentId: entry.sourceAgentId ?? null,
        referralLevel: entry.referralLevel ?? null,
        dedupeKey: entry.dedupeKey ?? null,
      },
    });
  } catch (err) {
    // Two callers raced past the check above and the unique index caught the
    // loser. Put the balance back — the winner has already credited it.
    if (entry.dedupeKey && isUniqueViolation(err)) {
      await tx.dataAgent
        .update({ where: { id: entry.agentId }, data: { balance: { decrement: amount } } })
        .catch(() => {});
      throw new DuplicateLedgerEntryError();
    }
    throw err;
  }
  return balanceAfter;
}

/** Postgres unique-constraint violation, as Prisma reports it. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
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
    order = await dataDb.dataOrder.findUnique({
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
    await dataDb.dataOrder.updateMany({
      where: { id: orderId, commissionStatus: "pending" },
      data: { commissionStatus: "void" },
    });
    return false;
  }

  // A suspended agent stops earning on new deliveries; the order stays pending
  // so an admin can release it by reactivating them.
  const agent = await dataDb.dataAgent.findUnique({
    where: { id: order.agentId },
    select: { status: true },
  });
  if (!agent || agent.status !== "active") return false;

  const claimed = await dataDb.dataOrder.updateMany({
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
    await dataDb.dataOrder.updateMany({
      where: { id: orderId, commissionStatus: "earned" },
      data: { commissionStatus: "pending", commissionPaidAt: null },
    });
    return false;
  }
}

/** Void the commission on an order that failed or was refunded. */
export async function voidAgentCommission(orderId: string): Promise<void> {
  try {
    await dataDb.dataOrder.updateMany({
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
    owed = await dataDb.dataOrder.findMany({
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
    row = await dataDb.afaRegistration.findUnique({
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

  const agent = await dataDb.dataAgent.findUnique({
    where: { id: row.agentId },
    select: { status: true },
  });
  if (!agent || agent.status !== "active") return false;

  const claimed = await dataDb.afaRegistration.updateMany({
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
    await dataDb.afaRegistration.updateMany({
      where: { id, commissionStatus: "earned" },
      data: { commissionStatus: "pending", commissionPaidAt: null },
    });
    return false;
  }
}
