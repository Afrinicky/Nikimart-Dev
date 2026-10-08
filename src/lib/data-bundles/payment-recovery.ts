import "server-only";
import { dataDb } from "@/lib/data-db";
import { isPaymentConfigured, verifyTransaction } from "@/lib/payments";
import { isDataReference, isAfaReference } from "@/lib/data-bundles/reference";
import {
  afaPaymentCovers,
  dataPaymentCovers,
  settleAfaRegistration,
  settleDataOrder,
} from "@/lib/data-bundles/fulfillment";

/**
 * Asking Paystack again, for the orders nothing else ever asked about.
 *
 * A bundle order settled in exactly two ways, and both of them happen outside
 * this system: the buyer's browser completing the redirect to /…/verify, or
 * Paystack's webhook arriving. That is fine until a checkout is interrupted —
 * the buyer closes the tab, the MoMo app takes the foreground, the network
 * drops, or they come back to a Paystack page reading "Transaction was already
 * successful" and press Close. The redirect then never runs. If the webhook is
 * also missed, the charge is captured, the order reads "awaiting payment"
 * forever, and nothing on our side ever asks Paystack again.
 *
 * Wallet top-ups have had a re-check sweep against this exact failure since
 * they shipped — the comment in lib/data-bundles/wallet spells out why, almost
 * word for word. Orders never got one. This is that missing half, and it runs
 * from three places on purpose:
 *
 *   • the tracker, when somebody looks up an unpaid order — which is the
 *     moment a person is standing there wondering where their money went;
 *   • the sweep, so an order nobody is watching is recovered within the hour;
 *   • the admin console, on a button, for the one somebody is asking about.
 *
 * Everything it calls is idempotent, so all three racing each other settle the
 * order once and dispatch the bundle once.
 */

/** Give the redirect and the webhook a moment before chasing a reference. */
const RECHECK_AFTER_MS = 90_000;
/**
 * Don't ask about the same reference more often than this.
 *
 * Short, because the common case is a mobile-money charge that is still going
 * through: the buyer has answered the prompt and Paystack holds it "pending"
 * while the network confirms, often for under a minute. A throttle longer
 * than that settlement window leaves somebody staring at "awaiting payment"
 * for no reason other than that we had just asked.
 */
const REASK_AFTER_MS = 30_000;
/**
 * After this an unpaid order is a checkout somebody walked away from. Paystack
 * keeps the transaction, so a claim can still be settled by hand — this only
 * stops the sweep re-asking about it forever.
 */
const STOP_CHASING_AFTER_MS = 7 * 24 * 60 * 60_000;

export type ReconcileOutcome =
  | { state: "settled"; amount: number }
  | { state: "already-paid" }
  | { state: "unpaid"; status: string }
  | { state: "underpaid"; paid: number; owed: number }
  | { state: "unchecked"; reason: string };

/**
 * Ask Paystack about one reference and settle it if the money is really there.
 *
 * Never throws. Every caller is somewhere a failure must not matter — a page
 * render, a sweep, an admin button — and "we could not check" is a perfectly
 * good answer that leaves the order exactly as it was.
 */
export async function reconcileDataOrder(
  reference: string,
  opts: { force?: boolean } = {},
): Promise<ReconcileOutcome> {
  const ref = reference.trim();
  if (!isDataReference(ref) && !isAfaReference(ref)) {
    return { state: "unchecked", reason: "That isn't a bundle reference." };
  }
  if (!isPaymentConfigured("data")) {
    return { state: "unchecked", reason: "Payments aren't configured on this environment." };
  }

  const isAfa = isAfaReference(ref);

  // Read what we hold first. An order already settled needs no gateway call,
  // and one asked about seconds ago needs no second one.
  if (!isAfa) {
    const order = await dataDb.dataOrder
      .findUnique({
        where: { reference: ref },
        select: { id: true, paymentStatus: true, lastVerifiedAt: true },
      })
      .catch(() => null);
    if (!order) return { state: "unchecked", reason: "No such order." };
    if (order.paymentStatus === "paid") return { state: "already-paid" };
    if (
      !opts.force &&
      order.lastVerifiedAt &&
      order.lastVerifiedAt.getTime() > Date.now() - REASK_AFTER_MS
    ) {
      return { state: "unchecked", reason: "Just checked." };
    }
    // Stamped before the call, not after: two callers arriving together should
    // make one request between them, and the loser finding a fresh stamp is
    // what stops the second.
    await dataDb.dataOrder
      .update({ where: { id: order.id }, data: { lastVerifiedAt: new Date() } })
      .catch(() => {});
  }

  let result;
  try {
    result = await verifyTransaction(ref, "data");
  } catch {
    return { state: "unchecked", reason: "Couldn't reach Paystack." };
  }

  if (!result.paid) return { state: "unpaid", status: result.status };
  if (result.currency !== "GHS") {
    return { state: "unchecked", reason: "That payment wasn't in cedis." };
  }

  const covers = isAfa
    ? await afaPaymentCovers(ref, result.amountPesewas)
    : await dataPaymentCovers(ref, result.amountPesewas);
  if (!covers) {
    // Real money, but not enough of it. Settling would hand over a bundle that
    // was part paid for; saying so lets an admin decide.
    const owed = await amountOwed(ref, isAfa);
    return { state: "underpaid", paid: result.amountPesewas / 100, owed };
  }

  // Guarded, because this function promises never to throw and its callers
  // rely on that: one of them is a page render for somebody who has already
  // been charged, and an exception there is an error screen in front of a
  // person looking for their money. The money is settled either way — the
  // status flip happens before the dispatch that could fail.
  let settled = false;
  try {
    settled = isAfa ? await settleAfaRegistration(ref) : await settleDataOrder(ref);
  } catch (err) {
    console.error(
      `[data-bundles] settling ${ref} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { state: "unchecked", reason: "The payment is real but settling it failed." };
  }
  return settled
    ? { state: "settled", amount: result.amountPesewas / 100 }
    : { state: "already-paid" };
}

async function amountOwed(reference: string, isAfa: boolean): Promise<number> {
  try {
    const row = isAfa
      ? await dataDb.afaRegistration.findUnique({
          where: { reference },
          select: { price: true },
        })
      : await dataDb.dataOrder.findUnique({ where: { reference }, select: { price: true } });
    return row?.price ?? 0;
  } catch {
    return 0;
  }
}

/** What a reconcile outcome reads as on a screen. */
export function reconcileMessage(outcome: ReconcileOutcome): string {
  switch (outcome.state) {
    case "settled":
      return `Payment confirmed with Paystack. The bundle is on its way.`;
    case "already-paid":
      return "That order is already paid for.";
    case "unpaid":
      // Mobile money does not settle the instant the prompt is answered: the
      // charge sits "pending" or "ongoing" at Paystack while the network
      // confirms it, sometimes for a minute or two. Saying "nothing has been
      // settled" to somebody who has just approved a debit reads as a refusal
      // and is how people end up paying twice.
      if (outcome.status === "pending" || outcome.status === "ongoing") {
        return "The payment is still going through at the network. We keep checking — it settles on its own, usually within a couple of minutes.";
      }
      return outcome.status === "abandoned"
        ? "Paystack has no completed payment for this order — the checkout was never finished."
        : `Paystack reports that payment as “${outcome.status}”. Nothing has been settled.`;
    case "underpaid":
      return `Paystack captured GH₵${outcome.paid.toFixed(2)} against GH₵${outcome.owed.toFixed(2)} owed. Settle it by hand if that is right.`;
    case "unchecked":
      return outcome.reason;
  }
}

/**
 * Re-check the unpaid orders somebody is looking at right now.
 *
 * The sweep below runs once a day, and the tracker only re-checks the one
 * order a buyer searched for. Neither of those is the screen this failure is
 * actually noticed on: the owner opens the console, sees "awaiting payment"
 * against a bundle that was paid for ten minutes ago, and nothing on that page
 * has asked the gateway. So the console asks — the same "re-sync whatever is
 * open while a page is being built" the provider statuses already use, pointed
 * at payments instead of deliveries.
 *
 * Three things keep it cheap, all of them borrowed from that older pass:
 *
 *   • Only unpaid orders young enough to still be worth chasing, and only
 *     ones nobody has asked about in the last minute — `lastVerifiedAt` is
 *     both the stamp and the throttle, so twenty page loads make one call.
 *   • Newest first. The order somebody is standing over is the one just
 *     placed, not the one from last Tuesday.
 *   • A handful at a time, and never for longer than the page can afford. The
 *     calls that miss the deadline are not cancelled; they land after the
 *     render and show on the next one.
 */
const VIEW_MIN_AGE_MS = 20_000;
const VIEW_REASK_AFTER_MS = 30_000;
const VIEW_LIMIT = 6;
const VIEW_BUDGET_MS = 2_500;

export async function recoverStalePayments(
  opts: { agentId?: string; limit?: number; budgetMs?: number } = {},
): Promise<number> {
  if (!isPaymentConfigured("data")) return 0;

  const now = Date.now();
  let rows: { reference: string }[];
  try {
    rows = await dataDb.dataOrder.findMany({
      where: {
        paymentStatus: "unpaid",
        status: "pending",
        ...(opts.agentId ? { agentId: opts.agentId } : {}),
        createdAt: {
          gte: new Date(now - STOP_CHASING_AFTER_MS),
          lt: new Date(now - VIEW_MIN_AGE_MS),
        },
        OR: [
          { lastVerifiedAt: null },
          { lastVerifiedAt: { lt: new Date(now - VIEW_REASK_AFTER_MS) } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit ?? VIEW_LIMIT, VIEW_LIMIT),
      select: { reference: true },
    });
  } catch {
    // Columns not migrated yet, or the database is briefly away. Showing the
    // last known state is the right failure here.
    return 0;
  }
  if (rows.length === 0) return 0;

  let settled = 0;
  const work = Promise.allSettled(
    rows.map(async (row) => {
      const outcome = await reconcileDataOrder(row.reference, { force: true });
      if (outcome.state === "settled") settled += 1;
    }),
  );

  await Promise.race([
    work,
    new Promise((resolve) => setTimeout(resolve, opts.budgetMs ?? VIEW_BUDGET_MS)),
  ]);
  return settled;
}

/**
 * Re-check every unpaid order nobody is watching.
 *
 * Runs from the data-bundle sweep, so a payment that slipped past both the
 * redirect and the webhook is found within the hour rather than when somebody
 * complains. Oldest first, because the longest-waiting buyer is the one most
 * likely to be about to pay twice.
 */
export async function sweepUnpaidDataOrders(limit = 25): Promise<number> {
  if (!isPaymentConfigured("data")) return 0;

  const now = Date.now();
  let rows;
  try {
    rows = await dataDb.dataOrder.findMany({
      where: {
        paymentStatus: "unpaid",
        status: "pending",
        createdAt: {
          gte: new Date(now - STOP_CHASING_AFTER_MS),
          lt: new Date(now - RECHECK_AFTER_MS),
        },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { reference: true },
    });
  } catch {
    return 0; // columns not migrated yet
  }

  let settled = 0;
  for (const row of rows) {
    const outcome = await reconcileDataOrder(row.reference, { force: true });
    if (outcome.state === "settled") settled += 1;
  }
  return settled;
}

/** The same sweep for AFA registrations, which settle down the same two paths. */
export async function sweepUnpaidAfaRegistrations(limit = 10): Promise<number> {
  if (!isPaymentConfigured("data")) return 0;

  const now = Date.now();
  let rows;
  try {
    rows = await dataDb.afaRegistration.findMany({
      where: {
        paymentStatus: "unpaid",
        status: "pending",
        createdAt: {
          gte: new Date(now - STOP_CHASING_AFTER_MS),
          lt: new Date(now - RECHECK_AFTER_MS),
        },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { reference: true },
    });
  } catch {
    return 0;
  }

  let settled = 0;
  for (const row of rows) {
    const outcome = await reconcileDataOrder(row.reference, { force: true });
    if (outcome.state === "settled") settled += 1;
  }
  return settled;
}

/**
 * Settle an order on an admin's word rather than the gateway's.
 *
 * The last resort, and deliberately a separate function from the automatic
 * path: it hands over a bundle on somebody's say-so, so it records who said
 * so. Everything it then does — the dispatch, the commissions — is the normal
 * settlement path, because an order settled by hand is still an ordinary paid
 * order from that moment on.
 */
export async function settleOrderByHand(
  orderId: string,
  by: string,
): Promise<{ ok: boolean; message: string }> {
  let order;
  try {
    order = await dataDb.dataOrder.findUnique({
      where: { id: orderId },
      select: { reference: true, paymentStatus: true },
    });
  } catch {
    return { ok: false, message: "Couldn't read that order." };
  }
  if (!order) return { ok: false, message: "That order no longer exists." };
  if (order.paymentStatus === "paid") {
    return { ok: false, message: "That order is already paid for." };
  }

  // Stamped before settling, so the record of who released it survives even if
  // the dispatch that follows fails.
  await dataDb.dataOrder
    .update({ where: { id: orderId }, data: { settledBy: by.slice(0, 120) } })
    .catch(() => {});

  const settled = await settleDataOrder(order.reference);
  return settled
    ? { ok: true, message: "Payment recorded. The bundle is being sent now." }
    : { ok: false, message: "That order had already been settled." };
}
