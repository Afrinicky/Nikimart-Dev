import "server-only";
import { headers } from "next/headers";
import { dataDb } from "@/lib/data-db";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { toLocalGhPhone } from "@/lib/data-bundles/networks";
import { AFA_REFERENCE_PREFIX } from "@/lib/data-bundles/fulfillment";
import { syncOpenOrders } from "@/lib/data-bundles/order-sync";
import { reconcileDataOrder } from "@/lib/data-bundles/payment-recovery";

/**
 * Public order lookup for the bundle storefront.
 *
 * Guests buy without an account, so the reference or the phone number they paid
 * with is the only key they have. The result is deliberately narrow — one
 * order, the fields a receipt would show and nothing else — and rate-limited
 * per IP so the number space can't be walked.
 */

export interface LookupOrder {
  kind: "bundle";
  reference: string;
  network: string;
  sizeGb: number;
  price: number;
  recipientPhone: string;
  status: string;
  /** unpaid | paid. What the claim button is offered on. */
  paymentStatus: string;
  providerCode: string | null;
  createdAt: Date;
  /** True while a claim on this order is waiting on an admin. */
  claimPending?: boolean;
}

export interface LookupAfa {
  kind: "afa";
  reference: string;
  fullName: string;
  phoneNumber: string;
  price: number;
  status: string;
  createdAt: Date;
}

export type LookupHit = LookupOrder | LookupAfa;

export type LookupOutcome =
  | { state: "idle" }
  | { state: "error"; message: string }
  | { state: "empty" }
  | { state: "found"; hits: LookupHit[] };

/** Mask all but the last three digits — enough to recognise, not to harvest. */
export function maskPhone(phone: string): string {
  return phone.length <= 3 ? phone : `${phone.slice(0, 3)}••••${phone.slice(-3)}`;
}

export async function lookupOrders(rawQuery: string | undefined): Promise<LookupOutcome> {
  const q = (rawQuery ?? "").trim();
  if (!q) return { state: "idle" };
  if (q.length < 4) {
    return { state: "error", message: "Enter your order reference or the phone number you used." };
  }

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const limit = await rateLimit(`data-lookup:${ip}`, 20, 5 * 60_000);
  if (!limit.ok) {
    return {
      state: "error",
      message: `Too many lookups. Please try again in ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  const reference = q.toUpperCase();
  // Deliberately the lenient normaliser, not the strict one used at purchase:
  // someone tracking an order is searching, not buying, and may well paste
  // "+233…" out of their call log. Nothing is sent anywhere on a match.
  const phone = toLocalGhPhone(q);

  try {
    if (reference.startsWith(AFA_REFERENCE_PREFIX)) {
      const row = await dataDb.afaRegistration.findUnique({ where: { reference } });
      if (!row) return { state: "empty" };
      return {
        state: "found",
        hits: [
          {
            kind: "afa",
            reference: row.reference,
            fullName: row.fullName,
            phoneNumber: row.phoneNumber,
            price: row.price,
            status: row.status,
            createdAt: row.createdAt,
          },
        ],
      };
    }

    const rows = await dataDb.dataOrder.findMany({
      where: phone
        ? { OR: [{ buyerPhone: phone }, { recipientPhone: phone }] }
        : { reference },
      orderBy: { createdAt: "desc" },
      // One order, not a history. A phone number can have bought a dozen
      // bundles, and showing all of them buries the one the person is standing
      // there waiting for behind orders they already received. The newest match
      // is the one they mean; older ones are still reachable by reference.
      take: 1,
      select: {
        id: true,
        reference: true,
        network: true,
        sizeGb: true,
        price: true,
        recipientPhone: true,
        status: true,
        paymentStatus: true,
        providerCode: true,
        createdAt: true,
      },
    });

    if (rows.length === 0) return { state: "empty" };

    // Somebody is standing there asking where their bundle is, which is the
    // one moment the answer has to be current. Ask the provider about this one
    // order — it does nothing once the order has landed, and the lookup is
    // already rate limited per address.
    const row = rows[0];
    if (row.status === "queued" || row.status === "processing") {
      const moved = await syncOpenOrders({ references: [row.reference], limit: 1 });
      if (moved > 0) {
        const fresh = await dataDb.dataOrder
          .findUnique({
            where: { reference: row.reference },
            select: { status: true, providerCode: true },
          })
          .catch(() => null);
        if (fresh) {
          row.status = fresh.status;
          row.providerCode = fresh.providerCode;
        }
      }
    }

    // An order that still reads unpaid is the other thing worth re-asking, and
    // the gateway is who to ask. This is the exact case an interrupted
    // checkout leaves behind: the money was taken and the settlement never
    // ran, so the person who paid is looking at "awaiting payment" with no way
    // to fix it. Looking it up now settles it. Cheap, because it is one
    // gateway call per lookup at most and it refuses to repeat itself.
    let claimPending = false;
    if (row.paymentStatus !== "paid") {
      const outcome = await reconcileDataOrder(row.reference);
      if (outcome.state === "settled" || outcome.state === "already-paid") {
        const fresh = await dataDb.dataOrder
          .findUnique({
            where: { reference: row.reference },
            select: { status: true, paymentStatus: true, providerCode: true },
          })
          .catch(() => null);
        if (fresh) {
          row.status = fresh.status;
          row.paymentStatus = fresh.paymentStatus;
          row.providerCode = fresh.providerCode;
        }
      }
      if (row.paymentStatus !== "paid") {
        claimPending = Boolean(
          await dataDb.dataPaymentClaim
            .findFirst({ where: { orderId: row.id, status: "pending" }, select: { id: true } })
            .catch(() => null),
        );
      }
    }

    return {
      state: "found",
      // The id is how the claim was looked up; it has no business leaving the
      // server, so it is dropped on the way out.
      hits: rows.map((r) => ({
        kind: "bundle" as const,
        reference: r.reference,
        network: r.network,
        sizeGb: r.sizeGb,
        price: r.price,
        recipientPhone: r.recipientPhone,
        status: r.status,
        paymentStatus: r.paymentStatus,
        providerCode: r.providerCode,
        createdAt: r.createdAt,
        claimPending,
      })),
    };
  } catch {
    return {
      state: "error",
      message: "Order lookup is unavailable right now. Please try again shortly.",
    };
  }
}
