import "server-only";
import { dataDb } from "@/lib/data-db";
import { initializeTransaction, isPaymentConfigured, toPesewas } from "@/lib/payments";
import { callbackOrigin } from "@/lib/site";
import { bundleLabel } from "@/lib/data-bundles/networks";

/**
 * Re-opening the checkout on an order that was never paid for.
 *
 * An interrupted checkout leaves a real order with a real price and no money
 * against it. Until now the console could do three things about that, and all
 * three assumed the money already existed somewhere: ask Paystack again,
 * settle a buyer's claim, or record the payment by hand. None of them is any
 * use for the ordinary case — the buyer closed the tab, or never got as far
 * as the prompt — where what is actually wanted is to ask them again.
 *
 * So this re-opens the same checkout. The reference is the order's own, which
 * is what keeps one order to one payment: the gateway's record, the webhook,
 * the tracker and the ledger all key off it, and a second reference would be
 * a second order in everything but name. Paystack will re-issue a checkout
 * for a reference it has not captured, which is exactly the case this is for
 * — the service orders have settled this way since they shipped.
 *
 * Nothing here settles anything. The link is handed over, the buyer pays, and
 * the order continues down the path it would have taken at checkout: the
 * redirect or the webhook settles it, and the bundle is dispatched.
 */

export type OrderPaymentLink =
  | { ok: true; url: string; reference: string; amount: number }
  | { ok: false; error: string };

export interface OrderPaymentOptions {
  /** Restrict to one agent's own orders — what the agent console passes. */
  agentId?: string | null;
}

export async function startOrderPayment(
  orderId: string,
  opts: OrderPaymentOptions = {},
): Promise<OrderPaymentLink> {
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
        network: true,
        sizeGb: true,
        recipientPhone: true,
        buyerPhone: true,
        buyerEmail: true,
        source: true,
        agentId: true,
        agent: { select: { slug: true, code: true } },
      },
    });
  } catch {
    return { ok: false, error: "Couldn't read that order. Please try again." };
  }

  if (!order) return { ok: false, error: "That order no longer exists." };
  if (opts.agentId && order.agentId !== opts.agentId) {
    return { ok: false, error: "That order isn't yours." };
  }
  if (order.paymentStatus === "paid") {
    return { ok: false, error: "That order is already paid for." };
  }
  if (order.status !== "pending") {
    return {
      ok: false,
      error:
        order.status === "cancelled" || order.status === "refunded"
          ? "That order is closed. Place a new one instead."
          : "That order is already on its way — nothing is owed on it.",
    };
  }
  if (order.price <= 0) {
    return { ok: false, error: "There is nothing to collect on that order." };
  }
  if (!isPaymentConfigured("data")) {
    return { ok: false, error: "Payments aren't configured on this environment." };
  }

  // Back to wherever this order was bought, so the buyer lands on the page
  // that knows how to show them their own order afterwards.
  const verify =
    order.source === "STOREFRONT" && order.agent
      ? `/store/${order.agent.slug}/verify`
      : order.source === "AGENT"
        ? "/agent/verify"
        : "/data-bundles/verify";

  try {
    const { authorizationUrl } = await initializeTransaction(
      {
        // Paystack needs an email; buyers who did not give one get the same
        // stable per-order placeholder the checkout itself uses.
        email: order.buyerEmail || `${order.buyerPhone}@data.nikimart.app`,
        amountPesewas: toPesewas(order.price),
        reference: order.reference,
        callbackUrl: `${callbackOrigin()}${verify}`,
        metadata: {
          kind: "data-bundle",
          dataOrderId: order.id,
          network: order.network,
          size: bundleLabel(order.sizeGb),
          recipientPhone: order.recipientPhone,
          ...(order.agent ? { store: order.agent.slug, agentCode: order.agent.code } : {}),
        },
      },
      "data",
    );
    return { ok: true, url: authorizationUrl, reference: order.reference, amount: order.price };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Couldn't open a checkout. Please try again.",
    };
  }
}
