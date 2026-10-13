import { NextResponse } from "next/server";
import { dataDb } from "@/lib/data-db";
import { callbackTokenMatches } from "@/lib/data-bundles/callback-token";
import { applyProviderStatus } from "@/lib/data-bundles/fulfillment";
import { readCallback, type CallbackBody } from "@/lib/data-bundles/mtn/callback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Status callback from MTN's Customer Data Transfer API.
 *
 * Separate from the reseller's webhook next door because the two speak
 * different languages: MTN sends either a transfer envelope or a consent
 * decision, read in lib/data-bundles/mtn/callback.ts, and neither looks like
 * what the other provider posts. One route trying to parse both would have to
 * guess which it had been handed.
 *
 * Authentication is the scheme already in use: the URL we hand MTN carries the
 * order's reference and an HMAC of that reference keyed by AUTH_SECRET. A
 * caller therefore needs a valid reference *and* its matching token, and even
 * then can only move that one order — a token minted for one reference
 * validates for nothing else. MADAPI signs nothing itself, so this is the
 * proof.
 *
 * The route changes an order's status and nothing else. It cannot refund, pay
 * a commission directly, or touch another order; what it can do is hand a
 * status to `applyProviderStatus`, which is where terminal states are made
 * sticky and where delivery pays what delivery owes.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const reference = (url.searchParams.get("ref") ?? "").trim();
  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const token = url.searchParams.get("token") ?? "";
  if (!callbackTokenMatches(reference, token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: CallbackBody | null = null;
  try {
    body = (await req.json()) as CallbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const reading = readCallback(body);

  const order = await dataDb.dataOrder.findUnique({
    where: { reference },
    select: { id: true, fulfilledBy: true },
  });

  // An authenticated callback for an order this route has no business moving.
  // Accepted, so MTN stops retrying, and deliberately not applied: a reference
  // whose order went out through the other provider must not have its status
  // rewritten from here.
  if (!order || order.fulfilledBy !== "MTN") {
    return NextResponse.json({ ok: true, applied: false });
  }

  if (reading.status) {
    await applyProviderStatus(order.id, reading.providerStatus, reading.message, reading.status);
  }

  // Always 200 for a well-formed, authenticated callback so MTN stops
  // retrying. A body we could not read is not something a retry would fix, and
  // the status sweep still re-reads the order on its own.
  return NextResponse.json({ ok: true, applied: Boolean(reading.status), kind: reading.kind });
}
