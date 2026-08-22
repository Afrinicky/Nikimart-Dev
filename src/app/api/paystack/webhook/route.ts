import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { paystackSecretKey } from "@/lib/payments";
import { markOrderPaid, paymentCoversOrder } from "@/lib/order-fulfillment";
import {
  afaPaymentCovers,
  dataPaymentCovers,
  isAfaReference,
  isDataReference,
  settleAfaRegistration,
  settleDataOrder,
} from "@/lib/data-bundles/fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paystack webhook. Paystack signs each event with HMAC SHA512 over the raw
 * request body, keyed by the secret key, in the `x-paystack-signature` header.
 * We verify that before trusting anything, then settle the order on
 * `charge.success`. Settlement is idempotent, so redelivery is safe.
 *
 * One endpoint serves both storefronts: the reference prefix says which ledger
 * a charge belongs to — "ND-"/"NA-" are data bundles and AFA registrations,
 * anything else is a mall order.
 */
export async function POST(req: Request) {
  const secret = paystackSecretKey();
  if (!secret) {
    // Payments aren't configured — nothing to do.
    return NextResponse.json({ ok: true });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", secret).update(raw).digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    event?: string;
    data?: { reference?: string; status?: string; amount?: number; currency?: string };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (event.event === "charge.success" && event.data?.status === "success" && event.data.reference) {
    const reference = event.data.reference;
    const amount = event.data.amount ?? 0;
    const currency = event.data.currency ?? "GHS";
    // A signed event still has to pay for the order it names, in the right
    // currency, before we settle it.
    const covered =
      currency === "GHS" &&
      (isDataReference(reference)
        ? await dataPaymentCovers(reference, amount)
        : isAfaReference(reference)
          ? await afaPaymentCovers(reference, amount)
          : await paymentCoversOrder(reference, amount));

    if (covered) {
      if (isDataReference(reference)) await settleDataOrder(reference);
      else if (isAfaReference(reference)) await settleAfaRegistration(reference);
      else await markOrderPaid(reference);
    } else {
      console.warn(`[paystack] underpaid or mismatched charge for ${reference}: ${amount} ${currency}`);
    }
  }

  // Always 200 so Paystack stops retrying once we've accepted the event.
  return NextResponse.json({ ok: true });
}
