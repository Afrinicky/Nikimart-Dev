import "server-only";
import { dataDb } from "@/lib/data-db";
import { siteUrl } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import { notifyAdmins } from "@/lib/data-bundles/admin-alerts";
import { recordNotification } from "@/lib/data-bundles/notifications";
import { reconcileDataOrder } from "@/lib/data-bundles/payment-recovery";
import { settleOrderByHand } from "@/lib/data-bundles/payment-recovery";

/**
 * "I was debited and it still says awaiting payment."
 *
 * When every automatic check has come back empty — the redirect was
 * interrupted, the webhook never arrived, and asking Paystack again found
 * nothing — the buyer is the only person who can see their own MoMo prompt.
 * Their word is not proof, so a claim settles nothing by itself. What it does
 * is make somebody look: it reaches every admin by SMS, by email and in the
 * console's own bell the moment it is raised, and it sits on the order until
 * an admin confirms or rejects it.
 *
 * Confirming is what releases the bundle. That ordering is the point — a claim
 * that dispatched on its own would be a way to take a bundle for free.
 */

export interface PaymentClaim {
  id: string;
  orderId: string;
  reference: string;
  raisedBy: string;
  contact: string;
  note: string;
  status: string;
  decidedAt: Date | null;
  decidedBy: string | null;
  decision: string;
  createdAt: Date;
}

export type ClaimResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Raise a claim against an unpaid order.
 *
 * Paystack is asked one more time first, and for a good reason: most of these
 * are a settlement that was simply never run, and an order that settles itself
 * the moment somebody complains is better for everybody than a claim an admin
 * has to work through by hand.
 */
export async function raisePaymentClaim(input: {
  reference: string;
  contact: string;
  note: string;
  raisedBy?: "customer" | "agent";
}): Promise<ClaimResult> {
  const reference = input.reference.trim().toUpperCase();
  const contact = input.contact.trim().slice(0, 40);
  const note = input.note.trim().slice(0, 500);

  if (!reference) return { ok: false, error: "We need the order reference." };
  if (contact.length < 7) {
    return { ok: false, error: "Enter the phone number you paid with so we can trace it." };
  }

  // The cheap answer first. If the money is really at Paystack this settles the
  // order outright and there is nothing for an admin to decide.
  const recheck = await reconcileDataOrder(reference, { force: true });
  if (recheck.state === "settled") {
    return {
      ok: true,
      message: "Found it — that payment has been confirmed and your bundle is on its way.",
    };
  }
  if (recheck.state === "already-paid") {
    return { ok: true, message: "That order is already paid for and on its way." };
  }

  let order;
  try {
    order = await dataDb.dataOrder.findUnique({
      where: { reference },
      select: {
        id: true,
        reference: true,
        price: true,
        sizeGb: true,
        network: true,
        recipientPhone: true,
        paymentStatus: true,
      },
    });
  } catch {
    return { ok: false, error: "Couldn't reach the order right now. Please try again shortly." };
  }
  if (!order) return { ok: false, error: "We can't find an order with that reference." };
  if (order.paymentStatus === "paid") {
    return { ok: true, message: "That order is already paid for and on its way." };
  }

  let claim;
  try {
    claim = await dataDb.dataPaymentClaim.create({
      data: {
        orderId: order.id,
        reference: order.reference,
        raisedBy: input.raisedBy ?? "customer",
        contact,
        note,
      },
    });
  } catch {
    // The partial unique index refuses a second open claim on one order, which
    // is the right answer rather than an error: somebody pressing the button
    // twice has made one claim.
    const open = await dataDb.dataPaymentClaim
      .findFirst({ where: { orderId: order.id, status: "pending" } })
      .catch(() => null);
    if (open) {
      return {
        ok: true,
        message: "Your claim is already with us. We'll text you as soon as it's checked.",
      };
    }
    return { ok: false, error: "Couldn't record that claim. Please try again shortly." };
  }

  await announce(claim.id, {
    reference: order.reference,
    amount: order.price,
    bundle: `${bundleLabel(order.sizeGb)} ${networkLabel(order.network)}`,
    recipient: order.recipientPhone,
    contact,
  });

  return {
    ok: true,
    message:
      "Claim received. We're checking it against the payment gateway and will text you shortly.",
  };
}

/** Tell the admins, every way the console can. Best-effort, always. */
async function announce(
  claimId: string,
  o: { reference: string; amount: number; bundle: string; recipient: string; contact: string },
): Promise<void> {
  const link = `${siteUrl()}/admin/data/orders?status=pending&q=${encodeURIComponent(o.reference)}`;

  await recordNotification({
    kind: "PAYMENT",
    tone: "danger",
    title: `Payment claim on ${o.reference}`,
    body: `${o.contact} says ${formatMoney(o.amount)} left their wallet for ${o.bundle} to ${o.recipient}. Confirm it before the bundle goes out.`,
    href: link,
    dedupeKey: `PAYMENT_CLAIM:${claimId}`,
  });

  await notifyAdmins("bundle.payment-claim", {
    reference: o.reference,
    amount: formatMoney(o.amount),
    bundle: o.bundle,
    recipient: o.recipient,
    contact: o.contact,
    link,
  });
}

/** The open claim on one order, for the admin's order card. */
export async function openClaimFor(orderId: string): Promise<PaymentClaim | null> {
  try {
    return await dataDb.dataPaymentClaim.findFirst({
      where: { orderId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return null;
  }
}

/** Every open claim, keyed by order, for a page that renders many rows. */
export async function openClaimsByOrder(orderIds: string[]): Promise<Map<string, PaymentClaim>> {
  if (orderIds.length === 0) return new Map();
  try {
    const rows = await dataDb.dataPaymentClaim.findMany({
      where: { orderId: { in: orderIds }, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    const byOrder = new Map<string, PaymentClaim>();
    for (const row of rows) if (!byOrder.has(row.orderId)) byOrder.set(row.orderId, row);
    return byOrder;
  } catch {
    return new Map();
  }
}

export async function pendingClaimCount(): Promise<number> {
  try {
    return await dataDb.dataPaymentClaim.count({ where: { status: "pending" } });
  } catch {
    return 0;
  }
}

/**
 * Confirm a claim, which is what sends the bundle.
 *
 * Paystack is asked one last time before taking the admin's word, so a claim
 * that turns out to be a real captured payment is settled as one — the order
 * then carries the gateway as its evidence rather than a person.
 */
export async function confirmPaymentClaim(
  claimId: string,
  by: string,
): Promise<ClaimResult> {
  const claim = await dataDb.dataPaymentClaim
    .findUnique({ where: { id: claimId } })
    .catch(() => null);
  if (!claim) return { ok: false, error: "That claim no longer exists." };
  if (claim.status !== "pending") {
    return { ok: false, error: "That claim has already been decided." };
  }

  // Claim it first: two admins pressing confirm must dispatch one bundle.
  const won = await dataDb.dataPaymentClaim
    .updateMany({
      where: { id: claimId, status: "pending" },
      data: {
        status: "confirmed",
        decidedAt: new Date(),
        decidedBy: by.slice(0, 120),
        decision: "Confirmed — payment accepted and the bundle released.",
      },
    })
    .catch(() => ({ count: 0 }));
  if (won.count === 0) return { ok: false, error: "That claim has already been decided." };

  const recheck = await reconcileDataOrder(claim.reference, { force: true });
  if (recheck.state === "settled" || recheck.state === "already-paid") {
    return { ok: true, message: "Payment confirmed at the gateway. The bundle is on its way." };
  }

  const settled = await settleOrderByHand(claim.orderId, by);
  if (!settled.ok) {
    // Put the claim back rather than leaving it closed over an order that is
    // still unpaid — the admin has to be able to try again.
    await dataDb.dataPaymentClaim
      .updateMany({
        where: { id: claimId, status: "confirmed" },
        data: { status: "pending", decidedAt: null, decidedBy: null, decision: "" },
      })
      .catch(() => {});
    return { ok: false, error: settled.message };
  }
  return { ok: true, message: settled.message };
}

/** Turn a claim down. The order stays exactly as it was. */
export async function rejectPaymentClaim(
  claimId: string,
  by: string,
  reason: string,
): Promise<ClaimResult> {
  const rejected = await dataDb.dataPaymentClaim
    .updateMany({
      where: { id: claimId, status: "pending" },
      data: {
        status: "rejected",
        decidedAt: new Date(),
        decidedBy: by.slice(0, 120),
        decision: reason.trim().slice(0, 300) || "No payment found for this order.",
      },
    })
    .catch(() => ({ count: 0 }));
  return rejected.count > 0
    ? { ok: true, message: "Claim rejected. The order is unchanged." }
    : { ok: false, error: "That claim has already been decided." };
}
