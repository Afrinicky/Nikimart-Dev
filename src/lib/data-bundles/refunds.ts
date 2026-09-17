import "server-only";
import { dataDb } from "@/lib/data-db";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import {
  DuplicateLedgerEntryError,
  postLedgerEntry,
  voidAgentCommission,
} from "@/lib/data-bundles/agent-ledger";
import { voidTeamCommission } from "@/lib/data-bundles/referrals";

/**
 * Pulling a queued order back, and putting the money somewhere it can be used.
 *
 * Queued is the only state this is allowed from: the order has been accepted
 * upstream but nothing has been sent, so there is still something to cancel. A
 * delivered bundle cannot be un-delivered, and a failed one is already free.
 *
 * The cash went to Paystack at purchase, and Paystack is not where it comes
 * back from — reversing a card charge days later is a support case, not a
 * button. So for a sale that belongs to an agent, the refund is credited to
 * that agent's Nickimart wallet instead: they can withdraw it to MoMo or spend
 * it on their next order, and they settle their own customer in cash. A house
 * (WEB) order has no agent to credit, so it is simply marked refunded and
 * reconciled in Paystack.
 */

export type RefundOutcome =
  | {
      ok: true;
      /** Cedis credited to the agent's wallet. 0 when there was nothing to move. */
      credited: number;
      message: string;
    }
  | { ok: false; error: string };

export interface RefundOptions {
  /**
   * Restrict the refund to one agent's own orders. The agent console passes
   * this so an id from the browser can never reach somebody else's sale; the
   * admin console leaves it out.
   */
  agentId?: string | null;
  /** Who pressed the button, for the ledger narration. */
  by?: "admin" | "agent";
}

export async function cancelAndRefundOrder(
  orderId: string,
  opts: RefundOptions = {},
): Promise<RefundOutcome> {
  let order;
  try {
    order = await dataDb.dataOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        reference: true,
        status: true,
        paymentStatus: true,
        price: true,
        agentId: true,
        network: true,
        sizeGb: true,
        recipientPhone: true,
      },
    });
  } catch {
    return { ok: false, error: "Couldn't read that order. Please try again." };
  }

  if (!order) return { ok: false, error: "That order no longer exists." };
  if (opts.agentId && order.agentId !== opts.agentId) {
    return { ok: false, error: "That order isn't yours." };
  }
  if (order.status !== "queued") {
    return {
      ok: false,
      error:
        order.status === "refunded"
          ? "That order has already been cancelled and refunded."
          : "Only a queued order can be cancelled — this one has already moved on.",
    };
  }

  // One guarded flip decides the winner: two admins on the same row, or an
  // admin and the agent, and only one of them writes the refund.
  const claimed = await dataDb.dataOrder
    .updateMany({ where: { id: orderId, status: "queued" }, data: { status: "refunded" } })
    .catch(() => ({ count: 0 }));
  if (claimed.count === 0) {
    return { ok: false, error: "That order has just changed — refresh and try again." };
  }

  // A cancelled sale pays nobody: not the agent who made it, not their upline.
  await voidAgentCommission(orderId);
  await voidTeamCommission(orderId);

  const refundable = order.paymentStatus === "paid" && order.price > 0 && Boolean(order.agentId);
  if (!refundable) {
    return {
      ok: true,
      credited: 0,
      message: order.agentId
        ? "Order cancelled. Nothing was charged for it, so there is nothing to refund."
        : "Order cancelled and marked refunded. Send the money back in Paystack.",
    };
  }

  const bundle = `${bundleLabel(order.sizeGb)} ${networkLabel(order.network)}`;
  try {
    await postLedgerEntry({
      agentId: order.agentId!,
      type: "ORDER_REFUND",
      amount: order.price,
      narration: `Refund for cancelled order ${order.reference} — ${bundle} to ${order.recipientPhone}`,
      reference: order.reference,
      // The database, not this code path, is what makes a refund pay once.
      dedupeKey: `ORDER_REFUND:${orderId}`,
    });
  } catch (err) {
    if (err instanceof DuplicateLedgerEntryError) {
      return { ok: true, credited: 0, message: "That order was already refunded." };
    }
    // The wallet credit failed, so the order must not stay cancelled — put it
    // back and let whoever pressed the button try again.
    await dataDb.dataOrder
      .updateMany({ where: { id: orderId, status: "refunded" }, data: { status: "queued" } })
      .catch(() => {});
    return { ok: false, error: "Couldn't move the refund to the wallet. Please try again." };
  }

  return {
    ok: true,
    credited: order.price,
    message: `Order cancelled. GH₵${order.price.toFixed(2)} has been credited to the agent's wallet.`,
  };
}
