import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { toLocalGhPhone } from "@/lib/data-bundles/networks";
import { AFA_REFERENCE_PREFIX } from "@/lib/data-bundles/fulfillment";

/**
 * Public order lookup for the bundle storefront.
 *
 * Guests buy without an account, so the reference or the phone number they paid
 * with is the only key they have. The result set is deliberately narrow — the
 * fields a receipt would show and nothing else — and rate-limited per IP so the
 * number space can't be walked.
 */

export interface LookupOrder {
  kind: "bundle";
  reference: string;
  network: string;
  sizeGb: number;
  price: number;
  recipientPhone: string;
  status: string;
  providerCode: string | null;
  createdAt: Date;
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
      const row = await prisma.afaRegistration.findUnique({ where: { reference } });
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

    const rows = await prisma.dataOrder.findMany({
      where: phone
        ? { OR: [{ buyerPhone: phone }, { recipientPhone: phone }] }
        : { reference },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        reference: true,
        network: true,
        sizeGb: true,
        price: true,
        recipientPhone: true,
        status: true,
        providerCode: true,
        createdAt: true,
      },
    });

    if (rows.length === 0) return { state: "empty" };
    return { state: "found", hits: rows.map((r) => ({ kind: "bundle" as const, ...r })) };
  } catch {
    return {
      state: "error",
      message: "Order lookup is unavailable right now. Please try again shortly.",
    };
  }
}
