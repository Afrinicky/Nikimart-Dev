import "server-only";
import { dataDb } from "@/lib/data-db";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import { checkRecipient } from "@/lib/data-bundles/gh-phone";
import {
  canRecreditOrder,
  canRefundOrder,
  isLiveWithProvider,
  normaliseMomoPhone,
  refundDestinationFor,
  type RefundDestination,
} from "@/lib/data-bundles/refund-rules";
import {
  DuplicateLedgerEntryError,
  postLedgerEntry,
  voidAgentCommission,
} from "@/lib/data-bundles/agent-ledger";
import { voidTeamCommission } from "@/lib/data-bundles/referrals";
import { syncOpenOrders } from "@/lib/data-bundles/order-sync";
import { dispatchDataOrder } from "@/lib/data-bundles/fulfillment";

/**
 * Pulling an order back, and putting the money somewhere it can be used.
 *
 * What was wrong with this before, in one paragraph, because it is the whole
 * reason the file now looks like this: a refund was two unrelated operations
 * wearing one name. On a queued order it credited the selling agent's wallet
 * and left a ledger row behind. On a failed order the console offered a
 * different button — "Mark refunded" — which flipped the status, voided the
 * commissions and moved no money whatsoever. Both reported success. So a
 * refund landed in the wallet sometimes and silently nowhere the rest of the
 * time, which is exactly what was reported, and the deciding factor was a
 * status nobody was being shown.
 *
 * A second hole sat beside it. `reorderDataOrder` moves a failed order back to
 * "paid" before dispatching it; a dispatch that cannot start (no provider key)
 * leaves it there. "Paid" was refundable by nothing at all — not the queued
 * path, not the failed one — so a re-order that did not go through left an
 * order nobody could refund or retry. The same was true of "processing" after
 * a dispatch that died mid-flight.
 *
 * Now there is one refund, from every state an order can still be refunded
 * from, and it always does something: either money moves or it says why not.
 *
 * Where the money goes is a choice rather than a rule, because the cash went
 * to Paystack at purchase and Paystack is not where it comes back from —
 * reversing a card charge days later is a support case, not a button.
 *
 *   • To the selling agent's wallet. They can withdraw it to MoMo or spend it
 *     on the next order, and they settle their own customer. This is the only
 *     thing an agent may choose for their own sale.
 *   • To the buyer's mobile money. Nickimart sends the cedis by hand, exactly
 *     as a withdrawal is sent, and the refund row waits on "pending" until
 *     whoever sent it says so. Admins only.
 *
 * Either way a DataOrderRefund row is written, so every refund is answerable
 * afterwards — including the ones that have no ledger row by definition.
 */

export type { RefundDestination } from "@/lib/data-bundles/refund-rules";

export interface RefundMomoDetails {
  phone: string;
  name: string;
  network: string;
}

export type RefundOutcome =
  | {
      ok: true;
      /** Where the money went. */
      destination: RefundDestination;
      /** Cedis credited to the agent's wallet. 0 for a MoMo refund. */
      credited: number;
      /** Cedis owed to the buyer on MoMo, still to be sent. 0 otherwise. */
      owedToBuyer: number;
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
  /** Who pressed the button. An agent may only ever refund to their wallet. */
  by?: "admin" | "agent";
  /** Their name, for the refund record. */
  byName?: string | null;
  /** Where the money should go. Defaults to the wallet. */
  destination?: RefundDestination;
  /** Required when refunding to the buyer's mobile money. */
  momo?: RefundMomoDetails | null;
  note?: string | null;
}

function clean(value: string | null | undefined, max: number): string {
  return String(value ?? "").trim().slice(0, max);
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
        buyerPhone: true,
        buyerName: true,
      },
    });
  } catch {
    return { ok: false, error: "Couldn't read that order. Please try again." };
  }

  if (!order) return { ok: false, error: "That order no longer exists." };
  if (opts.agentId && order.agentId !== opts.agentId) {
    return { ok: false, error: "That order isn't yours." };
  }
  if (order.status === "refunded") {
    return { ok: false, error: "That order has already been cancelled and refunded." };
  }
  if (!canRefundOrder(order.status)) {
    return {
      ok: false,
      error:
        order.status === "processing"
          ? "The provider is already delivering this one and won't cancel it. Refresh its status, and if it fails it can be refunded then."
          : "A delivered bundle can't be refunded — the data has already landed.",
    };
  }

  // Our "queued" is a memory of what the provider last told us, and the
  // provider does not always say when it changes its mind. Ask it now, because
  // this is the one action where being a minute out of date means refunding a
  // bundle that is already being delivered — the buyer keeps the data and the
  // money both.
  //
  // Queued is the only state this can fire from, and it is also the only one
  // the provider will cancel: once it has started work the order is theirs
  // until it lands or fails. So anything the re-read turns up other than
  // queued or failed stops the refund here.
  if (isLiveWithProvider(order.status)) {
    await syncOpenOrders({ references: [order.reference], limit: 1 });
    const now = await dataDb.dataOrder
      .findUnique({ where: { id: orderId }, select: { status: true } })
      .catch(() => null);
    if (now?.status === "completed") {
      return {
        ok: false,
        error: "The provider has just delivered this bundle, so it can't be refunded now.",
      };
    }
    if (now?.status === "refunded") {
      return { ok: false, error: "That order has already been cancelled and refunded." };
    }
    if (now?.status === "processing") {
      return {
        ok: false,
        error: "The provider has just started on this one and won't cancel it now. Refresh its status, and if it fails it can be refunded then.",
      };
    }
    if (now) order.status = now.status;
  }

  const paid = order.paymentStatus === "paid" && order.price > 0;

  // An agent refunding their own sale has one destination: their wallet. The
  // choice is the admin's, because sending cedis to a buyer's MoMo is money
  // leaving the business and that is not an agent's decision to take — and a
  // house (WEB) order has no wallet to credit at all.
  const destination: RefundDestination = refundDestinationFor({
    byAdmin: opts.by === "admin",
    hasAgent: Boolean(order.agentId),
    requested: opts.destination ?? null,
  });

  if (destination === "BUYER_MOMO" && opts.by !== "admin") {
    return {
      ok: false,
      error: "This order wasn't an agent sale, so only an administrator can refund it.",
    };
  }

  let momo: RefundMomoDetails = { phone: "", name: "", network: "" };
  if (destination === "BUYER_MOMO" && paid) {
    const phone = normaliseMomoPhone(opts.momo?.phone || order.buyerPhone);
    if (!phone) {
      return {
        ok: false,
        error: "Enter the buyer's mobile money number as ten digits, starting 0.",
      };
    }
    momo = {
      phone,
      name: clean(opts.momo?.name, 120) || clean(order.buyerName, 120),
      network: clean(opts.momo?.network, 40),
    };
    if (!momo.name) {
      return { ok: false, error: "Enter the name on the buyer's mobile money account." };
    }
  }

  // One guarded flip decides the winner: two admins on the same row, or an
  // admin and the agent, and only one of them writes the refund.
  const wasStatus = order.status;
  const claimed = await dataDb.dataOrder
    .updateMany({
      where: { id: orderId, status: wasStatus },
      data: { status: "refunded", refundedAt: new Date() },
    })
    .catch(() => ({ count: 0 }));
  if (claimed.count === 0) {
    return { ok: false, error: "That order has just changed — refresh and try again." };
  }

  // A cancelled sale pays nobody: not the agent who made it, not their upline.
  await voidAgentCommission(orderId);
  await voidTeamCommission(orderId);

  if (!paid) {
    return {
      ok: true,
      destination,
      credited: 0,
      owedToBuyer: 0,
      message: "Order cancelled. Nothing was charged for it, so there is nothing to refund.",
    };
  }

  const bundle = `${bundleLabel(order.sizeGb)} ${networkLabel(order.network)}`;

  if (destination === "WALLET") {
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
        await recordRefund(order, destination, order.price, momo, opts, "settled");
        return {
          ok: true,
          destination,
          credited: 0,
          owedToBuyer: 0,
          message: "That order was already refunded to the wallet.",
        };
      }
      // The wallet credit failed, so the order must not stay cancelled — put
      // it back exactly as it was and let whoever pressed the button try again.
      await dataDb.dataOrder
        .updateMany({
          where: { id: orderId, status: "refunded" },
          data: { status: wasStatus, refundedAt: null },
        })
        .catch(() => {});
      return { ok: false, error: "Couldn't move the refund to the wallet. Please try again." };
    }

    await recordRefund(order, destination, order.price, momo, opts, "settled");
    return {
      ok: true,
      destination,
      credited: order.price,
      owedToBuyer: 0,
      message: `Order cancelled. GH₵${order.price.toFixed(2)} has been credited to the agent's wallet.`,
    };
  }

  // A MoMo refund moves no money here — it is a transfer somebody makes. The
  // row is the instruction, and it stays pending until they say it is sent.
  await recordRefund(order, destination, order.price, momo, opts, "pending");
  return {
    ok: true,
    destination,
    credited: 0,
    owedToBuyer: order.price,
    message: `Order cancelled. GH₵${order.price.toFixed(2)} is queued to be sent to ${momo.phone} — mark it sent once the transfer is made.`,
  };
}

/** Write the refund record. Never throws: the money has already moved. */
async function recordRefund(
  order: { id: string; reference: string; agentId: string | null },
  destination: RefundDestination,
  amount: number,
  momo: RefundMomoDetails,
  opts: RefundOptions,
  status: "settled" | "pending",
): Promise<void> {
  try {
    await dataDb.dataOrderRefund.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        reference: order.reference,
        agentId: order.agentId,
        amount,
        destination,
        status,
        momoPhone: momo.phone,
        momoName: momo.name,
        momoNetwork: momo.network,
        requestedBy: opts.by === "agent" ? "agent" : "admin",
        requestedByName: clean(opts.byName, 120),
        note: clean(opts.note, 300),
      },
      update: {},
    });
  } catch {
    // The table isn't migrated yet, or the row already exists. Neither is
    // worth failing a refund that has already been paid.
  }
}

// ---------------------------------------------------------------------------
// Marking a MoMo refund sent
// ---------------------------------------------------------------------------

export type RefundSettleOutcome = { ok: boolean; message: string };

/**
 * Record that a buyer's MoMo refund has actually been transferred.
 *
 * The guarded `updateMany` is what makes it once: two admins clearing the same
 * queue must not both stamp it, and the second should be told it is done
 * rather than quietly overwriting the first one's name.
 */
export async function markRefundSent(
  refundId: string,
  by: string,
): Promise<RefundSettleOutcome> {
  const id = String(refundId ?? "").trim();
  if (!id) return { ok: false, message: "That refund no longer exists." };

  let row;
  try {
    row = await dataDb.dataOrderRefund.findUnique({
      where: { id },
      select: { id: true, status: true, destination: true, amount: true },
    });
  } catch {
    return { ok: false, message: "Couldn't read that refund. Please try again." };
  }
  if (!row) return { ok: false, message: "That refund no longer exists." };
  if (row.destination !== "BUYER_MOMO") {
    return { ok: false, message: "A wallet refund is already settled." };
  }
  if (row.status === "settled") {
    return { ok: false, message: "That refund is already marked sent." };
  }

  const claimed = await dataDb.dataOrderRefund
    .updateMany({
      where: { id, status: "pending" },
      data: { status: "settled", paidBy: by.slice(0, 120), paidAt: new Date() },
    })
    .catch(() => ({ count: 0 }));
  if (claimed.count === 0) {
    return { ok: false, message: "Somebody has just marked that one sent." };
  }
  return { ok: true, message: `GH₵${row.amount.toFixed(2)} marked sent to the buyer.` };
}

// ---------------------------------------------------------------------------
// Cancel, and credit the bundle to another number
// ---------------------------------------------------------------------------

export type RecreditOutcome =
  | { ok: true; phone: string; message: string }
  | { ok: false; error: string };

export interface RecreditOptions {
  agentId?: string | null;
  by?: "admin" | "agent";
}

/**
 * Send the bundle somewhere else instead of refunding it.
 *
 * The common case behind a queued order nobody wants and a failed one nobody
 * can rescue is a mistyped number. Refunding it and buying it again costs the
 * agent a round trip through their wallet, loses the reference the customer
 * was given, and pays the commission twice over; what is actually wanted is
 * the same purchase, delivered to the right number.
 *
 * So it stays one order. The money, the reference, the commissions and the
 * ledger all stay attached to it, the original number is kept on the row so
 * the change is answerable, and the order goes back in line for dispatch. The
 * network cannot change — a bundle is bought for one carrier — so the new
 * number is checked against it before anything moves.
 */
export async function recreditOrderToNumber(
  orderId: string,
  newPhone: string,
  opts: RecreditOptions = {},
): Promise<RecreditOutcome> {
  let order;
  try {
    order = await dataDb.dataOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        reference: true,
        status: true,
        paymentStatus: true,
        network: true,
        sizeGb: true,
        agentId: true,
        recipientPhone: true,
        originalRecipientPhone: true,
        providerOrderId: true,
        agentCommission: true,
        teamCommission: true,
      },
    });
  } catch {
    return { ok: false, error: "Couldn't read that order. Please try again." };
  }

  if (!order) return { ok: false, error: "That order no longer exists." };
  if (opts.agentId && order.agentId !== opts.agentId) {
    return { ok: false, error: "That order isn't yours." };
  }
  if (order.paymentStatus !== "paid") {
    return { ok: false, error: "This order hasn't been paid for, so there is no bundle to move." };
  }
  if (!canRecreditOrder(order.status, order.paymentStatus)) {
    return {
      ok: false,
      error:
        order.status === "completed"
          ? "This bundle has already been delivered."
          : "Only a queued or failed order can be sent to another number.",
    };
  }

  const checked = checkRecipient(newPhone, order.network, networkLabel(order.network));
  if (!checked.ok) return { ok: false, error: checked.message };
  if (checked.local === order.recipientPhone) {
    return { ok: false, error: "That is the number the order is already for." };
  }

  // Ask the provider first on a queued order, for the same reason the refund
  // does: sending a second bundle to a different number after the first one
  // landed gives away two bundles for one payment.
  if (order.status === "queued") {
    await syncOpenOrders({ references: [order.reference], limit: 1 });
    const now = await dataDb.dataOrder
      .findUnique({ where: { id: orderId }, select: { status: true } })
      .catch(() => null);
    if (now && now.status !== "queued" && now.status !== "failed") {
      return {
        ok: false,
        error:
          now.status === "completed"
            ? "The provider has just delivered this bundle to the original number."
            : "The provider is already working on this order — refresh its status and try again.",
      };
    }
    if (now) order.status = now.status;
  }

  const wasStatus = order.status;
  const claimed = await dataDb.dataOrder
    .updateMany({
      where: { id: orderId, status: wasStatus },
      data: {
        recipientPhone: checked.local,
        // Written once only: a second re-credit must not lose the number the
        // customer actually bought for.
        ...(order.originalRecipientPhone
          ? {}
          : { originalRecipientPhone: order.recipientPhone }),
        status: "paid",
        providerOrderId: null,
        providerCode: null,
        providerStatus: null,
        providerMessage:
          `Re-credited to ${checked.local} (was ${order.recipientPhone})` +
          (order.providerOrderId ? `. The attempt on the old number was ${order.providerOrderId}.` : "."),
        completedAt: null,
        // The sale is live again, so it owes what it owed before.
        ...(order.agentCommission > 0
          ? { commissionStatus: "pending", commissionPaidAt: null }
          : {}),
        ...(order.teamCommission > 0
          ? { teamCommissionStatus: "pending", teamCommissionPaidAt: null }
          : {}),
      },
    })
    .catch(() => ({ count: 0 }));
  if (claimed.count === 0) {
    return { ok: false, error: "That order has just changed — refresh and try again." };
  }

  const sent = await dispatchDataOrder(orderId);
  if (!sent.ok) {
    return {
      ok: false,
      error: `The number was changed to ${checked.local}, but the provider wouldn't take it: ${sent.message}`,
    };
  }

  return {
    ok: true,
    phone: checked.local,
    message: `${bundleLabel(order.sizeGb)} ${networkLabel(order.network)} is on its way to ${checked.local}.`,
  };
}
