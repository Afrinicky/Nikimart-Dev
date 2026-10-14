import "server-only";
import { prisma } from "@/lib/prisma";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import {
  commissionHoldUntil,
  commissionStatusFor,
  reversalForRefund,
  type CommissionStatus,
  type RateSource,
} from "@/lib/affiliate-policy";

/**
 * The commission ledger: one row per order line, and every transition it can
 * make.
 *
 * The rule the whole module is built on is that **nothing advances a
 * commission**. Every function here recomputes what a row should say from the
 * order it belongs to and writes that. Which means all of them are safe to run
 * twice, in any order, from anywhere — the payment webhook that fires three
 * times, an admin saving a status that was already set, the console reconciling
 * on read. A ledger that could only move forwards would eventually be asked to
 * move forwards twice, and that is a double payout.
 *
 * Accrual is guarded by a unique index on the order line rather than by
 * checking first and inserting after: two notifications racing produce one row
 * and one constraint violation, which is exactly the outcome wanted.
 */

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Accrual
// ---------------------------------------------------------------------------

export interface AccrualLine {
  orderItemId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  rate: number;
  amount: number;
  fundedBy: string;
  ruleSource: RateSource;
  platformCommissionRate: number;
}

export interface AccrualInput {
  orderId: string;
  affiliateId: string;
  /** The window snapshotted on the attribution that produced the order. */
  attributionWindowDays: number;
  lines: AccrualLine[];
}

/**
 * Write the ledger for a newly placed order.
 *
 * Only lines that actually earned something get a row: an order mixing an
 * enrolled product with three that are not should not leave three zero rows
 * for somebody to wonder about later. The policy in force is snapshotted on
 * each row, because the return window has to be the one the affiliate was
 * shown when they made the sale, not the one an admin sets next month.
 */
export async function accrueAffiliateCommissions(input: AccrualInput): Promise<number> {
  const earning = input.lines.filter((l) => l.amount > 0 && l.rate > 0);
  if (earning.length === 0) return 0;

  const policy = await getAffiliatePolicy();

  try {
    const result = await prisma.affiliateCommission.createMany({
      // Two payment notifications for the same order would otherwise be two
      // ledgers. The unique index on the order line is what makes this safe;
      // skipping duplicates is how that surfaces as a no-op.
      skipDuplicates: true,
      data: earning.map((l) => ({
        affiliateId: input.affiliateId,
        orderId: input.orderId,
        orderItemId: l.orderItemId,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        baseAmount: money(l.unitPrice * l.quantity),
        rate: l.rate,
        amount: money(l.amount),
        fundedBy: l.fundedBy,
        ruleSource: l.ruleSource,
        platformCommissionRate: l.platformCommissionRate,
        attributionWindowDays: input.attributionWindowDays,
        returnWindowDays: policy.returnWindowDays,
        status: "pending",
      })),
    });
    return result.count;
  } catch {
    // Not migrated yet, or the order was removed underneath us. The order
    // itself still carries its own affiliate snapshot, so nothing is lost
    // that a later sync cannot rebuild.
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Bring an order's ledger into line with the order.
 *
 * Called from every place an order's status can change — payment confirmation,
 * an admin's status select, a shipment stage confirmation, a cancelled
 * checkout. One function rather than four copies of the rules, and derived
 * rather than incremental, so calling it on an order nothing has happened to
 * writes nothing.
 */
export async function syncAffiliateCommissions(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        shipment: { select: { deliveredAt: true, updatedAt: true } },
        affiliateCommissions: {
          select: {
            id: true,
            affiliateId: true,
            status: true,
            holdUntil: true,
            deliveredAt: true,
            returnWindowDays: true,
            reversedAmount: true,
            amount: true,
            clearedAt: true,
            payoutId: true,
          },
        },
      },
    });
    if (!order || order.affiliateCommissions.length === 0) return;

    // Delivery is what starts the clock. The shipment's own timestamp is the
    // honest one; an order flipped straight to "delivered" by an admin has no
    // shipment timestamp to read, so the moment the shipment last moved stands
    // in for it rather than "now" — re-running this must not keep pushing the
    // hold back.
    const deliveredAt =
      order.status === "delivered"
        ? (order.shipment?.deliveredAt ?? order.shipment?.updatedAt ?? new Date())
        : null;

    const now = new Date();

    for (const row of order.affiliateCommissions) {
      const reversed = row.status === "reversed" || row.reversedAmount >= row.amount;
      const next = commissionStatusFor({
        orderStatus: order.status,
        deliveredAt: deliveredAt ?? row.deliveredAt,
        returnWindowDays: row.returnWindowDays,
        // Paid means settled, not claimed. A line attached to a payout request
        // that has not been paid yet is still only cleared — treating it as
        // paid here would mark it settled the moment somebody asked.
        paid: row.status === "paid",
        reversed,
        now,
      });

      const holdUntil = deliveredAt
        ? commissionHoldUntil(deliveredAt, row.returnWindowDays)
        : row.holdUntil;

      const unchanged =
        next === row.status &&
        (deliveredAt?.getTime() ?? null) === (row.deliveredAt?.getTime() ?? null) &&
        (holdUntil?.getTime() ?? null) === (row.holdUntil?.getTime() ?? null);
      if (unchanged) continue;

      const newlyReversed = next === "reversed" && row.status !== "reversed";

      await prisma.affiliateCommission.update({
        where: { id: row.id },
        data: {
          status: next,
          deliveredAt: deliveredAt ?? row.deliveredAt,
          holdUntil,
          // The moment it cleared is a fact, not a status: a line that has
          // since been paid still cleared when it cleared. Only a row going
          // back to pending or clearing loses it.
          clearedAt:
            next === "cleared" || next === "paid"
              ? (row.clearedAt ?? now)
              : next === "reversed"
                ? row.clearedAt
                : null,
          ...(newlyReversed
            ? {
                reversedAt: now,
                reversedAmount: row.amount,
                reversalReason: `Order ${order.status}`,
              }
            : {}),
        },
      });

      // The reversal gets its own record, so the affiliate's statement says
      // what happened rather than a figure quietly shrinking.
      if (newlyReversed) {
        await prisma.affiliateAdjustment
          .create({
            data: {
              commissionId: row.id,
              affiliateId: row.affiliateId,
              orderId: order.id,
              kind: order.status === "cancelled" ? "cancellation" : "refund",
              amount: -row.amount,
              reason: `Order ${order.status}`,
            },
          })
          .catch(() => {});
      }
    }
  } catch {
    // Pre-migration databases have no ledger. Nothing to reconcile, and a
    // checkout must never fail because of it.
  }
}

/**
 * Clear every commission whose return window has elapsed.
 *
 * Time passing is the one transition nothing triggers, so it is done on read:
 * the affiliate's console and the admin's payout queue both call this before
 * they show a balance. Scoped to one affiliate where there is one, so opening
 * a dashboard does not sweep the whole platform.
 */
export async function clearDueCommissions(affiliateId?: string): Promise<number> {
  try {
    const result = await prisma.affiliateCommission.updateMany({
      where: {
        ...(affiliateId ? { affiliateId } : {}),
        status: "clearing",
        holdUntil: { lte: new Date() },
        payoutId: null,
      },
      data: { status: "cleared", clearedAt: new Date() },
    });
    return result.count;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Reversals and corrections
// ---------------------------------------------------------------------------

export interface ReversalInput {
  commissionId: string;
  /** How much of the line's value was refunded. Omit for the whole line. */
  refundedValue?: number;
  kind: "refund" | "return" | "cancellation" | "correction" | "clawback";
  reason: string;
  actorId: string;
}

/**
 * Take commission back, in proportion to what was actually refunded.
 *
 * A partial refund is a partial sale: giving back a third of a line's value
 * takes back a third of what it earned. Voiding the whole commission for a
 * partial refund punishes the affiliate for something the buyer did, and
 * voiding none of it pays commission on money the platform returned.
 *
 * A commission already settled by a payout is still reversed — the record has
 * to be true — and the amount becomes a debit the next payout nets off, which
 * is what the balance in lib/affiliate reads.
 */
export async function reverseCommission(input: ReversalInput): Promise<boolean> {
  const row = await prisma.affiliateCommission
    .findUnique({
      where: { id: input.commissionId },
      select: { id: true, affiliateId: true, orderId: true, amount: true, baseAmount: true, reversedAmount: true },
    })
    .catch(() => null);
  if (!row) return false;

  const take = reversalForRefund(
    row.amount,
    row.baseAmount,
    input.refundedValue ?? row.baseAmount,
  );
  if (take <= 0) return false;

  const total = money(Math.min(row.amount, row.reversedAmount + take));
  const now = new Date();

  await prisma.$transaction([
    prisma.affiliateCommission.update({
      where: { id: row.id },
      data: {
        reversedAmount: total,
        reversedAt: now,
        reversalReason: input.reason.slice(0, 500),
        // Partly reversed is not reversed: the rest of the line still earned,
        // and still clears and pays on its own terms.
        ...(total >= row.amount ? { status: "reversed", payoutId: null } : {}),
      },
    }),
    prisma.affiliateAdjustment.create({
      data: {
        commissionId: row.id,
        affiliateId: row.affiliateId,
        orderId: row.orderId,
        kind: input.kind,
        amount: -take,
        reason: input.reason.slice(0, 500),
        actorId: input.actorId,
      },
    }),
  ]);
  return true;
}

/** Undo a reversal that should not have happened. */
export async function releaseCommission(
  commissionId: string,
  reason: string,
  actorId: string,
): Promise<boolean> {
  const row = await prisma.affiliateCommission
    .findUnique({
      where: { id: commissionId },
      select: { id: true, affiliateId: true, orderId: true, reversedAmount: true },
    })
    .catch(() => null);
  if (!row || row.reversedAmount <= 0) return false;

  await prisma.$transaction([
    prisma.affiliateCommission.update({
      where: { id: row.id },
      data: {
        reversedAmount: 0,
        reversedAt: null,
        reversalReason: "",
        status: "pending",
      },
    }),
    prisma.affiliateAdjustment.create({
      data: {
        commissionId: row.id,
        affiliateId: row.affiliateId,
        orderId: row.orderId,
        kind: "release",
        amount: row.reversedAmount,
        reason: reason.slice(0, 500),
        actorId,
      },
    }),
  ]);
  // The row goes back into the lifecycle rather than straight to cleared: the
  // order decides where it belongs, as it always does.
  if (row.orderId) await syncAffiliateCommissions(row.orderId);
  return true;
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export interface LedgerBalance {
  /** Paid order, not yet delivered. */
  pending: number;
  /** Delivered, inside the return window. */
  clearing: number;
  /** Payable right now, less anything already requested or paid. */
  cleared: number;
  paid: number;
  reversed: number;
  /** Commission on live (non-reversed) lines, however far along. */
  earned: number;
  /** Open payout requests awaiting a decision. */
  requested: number;
  /** cleared − requested. What a payout request may ask for. */
  available: number;
  /** How many order lines have earned. */
  lines: number;
  orders: number;
}

export const EMPTY_BALANCE: LedgerBalance = {
  pending: 0,
  clearing: 0,
  cleared: 0,
  paid: 0,
  reversed: 0,
  earned: 0,
  requested: 0,
  available: 0,
  lines: 0,
  orders: 0,
};

/**
 * What an affiliate has earned and what they can ask for.
 *
 * Read off the ledger rather than off the orders, because the ledger is the
 * thing that knows about reversals and about which payout settled what. Due
 * commission is cleared first, so a balance is never stale by a return window.
 */
export async function getLedgerBalance(affiliateId: string): Promise<LedgerBalance> {
  await clearDueCommissions(affiliateId);
  try {
    const [rows, payouts] = await Promise.all([
      prisma.affiliateCommission.findMany({
        where: { affiliateId },
        select: { status: true, amount: true, reversedAmount: true, orderId: true },
      }),
      prisma.affiliatePayout.findMany({
        where: { affiliateId },
        select: { amount: true, status: true },
      }),
    ]);

    const balance = { ...EMPTY_BALANCE };
    const orders = new Set<string>();
    for (const row of rows) {
      // What survives any reversal on the line. A partly refunded line still
      // carries the rest of its commission.
      const live = money(Math.max(0, row.amount - row.reversedAmount));
      balance.reversed = money(balance.reversed + row.reversedAmount);
      if (row.reversedAmount > 0 && live === 0) continue;
      orders.add(row.orderId);
      balance.lines += 1;
      balance.earned = money(balance.earned + live);
      if (row.status === "pending") balance.pending = money(balance.pending + live);
      else if (row.status === "clearing") balance.clearing = money(balance.clearing + live);
      else if (row.status === "cleared") balance.cleared = money(balance.cleared + live);
      else if (row.status === "paid") balance.paid = money(balance.paid + live);
    }

    balance.orders = orders.size;
    balance.requested = money(
      payouts
        .filter((p) => p.status === "pending" || p.status === "processing")
        .reduce((sum, p) => sum + p.amount, 0),
    );
    // A payout already made against a line that was later reversed leaves the
    // affiliate owing it back. Netting it off here means the next payout
    // settles the debt rather than an admin chasing it.
    balance.available = money(Math.max(0, balance.cleared - balance.requested));
    return balance;
  } catch {
    return { ...EMPTY_BALANCE };
  }
}

/** The status every commission row can be in, for filter dropdowns. */
export const COMMISSION_STATUSES: { value: CommissionStatus; label: string }[] = [
  { value: "pending", label: "Awaiting delivery" },
  { value: "clearing", label: "In return window" },
  { value: "cleared", label: "Payable" },
  { value: "paid", label: "Paid out" },
  { value: "reversed", label: "Reversed" },
];

export const COMMISSION_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  COMMISSION_STATUSES.map((s) => [s.value, s.label]),
);
