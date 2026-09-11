import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { paystackAccounts, type PaymentAccount } from "@/lib/payments";
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
 * One endpoint, two accounts
 * --------------------------
 * The mall and the bundle business settle into different Paystack accounts, and
 * both point their webhook here. So the signature is checked against each
 * configured key in turn, and whichever one matches is the account that took
 * the charge.
 *
 * Then the important part: that account has to be the one that *owns* the
 * reference. "ND-"/"NA-" are bundle and AFA references and belong to the data
 * account; anything else is a mall order and belongs to retail. Without that
 * check, anyone holding one account's key could sign an event naming an order
 * in the other's ledger and have it settled unpaid — which is a way to take
 * goods for free, not a theoretical concern about tidiness.
 */
export async function POST(req: Request) {
  const accounts = paystackAccounts();
  if (accounts.length === 0) {
    // Payments aren't configured — nothing to do.
    return NextResponse.json({ ok: true });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";

  let signedBy: PaymentAccount | null = null;
  for (const { account, secret } of accounts) {
    const expected = createHmac("sha512", secret).update(raw).digest("hex");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    // Compared in full for every key — returning early on a length mismatch
    // would still be constant-time per key, and checking them all keeps the
    // work done independent of which account signed.
    if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) signedBy = account;
  }
  if (!signedBy) {
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

    const belongsTo: PaymentAccount =
      isDataReference(reference) || isAfaReference(reference) ? "data" : "retail";
    if (belongsTo !== signedBy) {
      console.warn(
        `[paystack] ${signedBy} account signed a charge for ${reference}, which belongs to ${belongsTo}. Ignored.`,
      );
      return NextResponse.json({ ok: true });
    }

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
