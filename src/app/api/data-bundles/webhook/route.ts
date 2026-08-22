import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callbackTokenMatches } from "@/lib/data-bundles/callback-token";
import {
  applyAfaProviderStatus,
  applyProviderStatus,
  isAfaReference,
} from "@/lib/data-bundles/fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Status callback from the data provider.
 *
 * The provider's order API takes a `callback` URL but signs nothing, so the URL
 * we hand it carries the reference it belongs to plus a token derived from that
 * reference (see callback-token.ts). A caller therefore needs a valid reference
 * *and* its matching token, and even then can only move that one order's
 * status — never another's.
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

  type CallbackBody = { status?: string; message?: string; payload?: { status?: string } };
  let body: CallbackBody | null = null;
  try {
    body = (await req.json()) as CallbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // The provider nests the order under `payload` on its documented responses;
  // accept a flat body too in case a callback is shaped differently.
  const providerStatus = body?.payload?.status ?? body?.status ?? null;
  if (!providerStatus) {
    return NextResponse.json({ error: "Missing status" }, { status: 400 });
  }
  const message = typeof body?.message === "string" ? body.message : undefined;

  if (isAfaReference(reference)) {
    const row = await prisma.afaRegistration.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (row) await applyAfaProviderStatus(row.id, providerStatus, message);
  } else {
    const order = await prisma.dataOrder.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (order) await applyProviderStatus(order.id, providerStatus, message);
  }

  // Always 200 for a well-formed, authenticated callback so the provider stops
  // retrying — an unknown reference is nothing we can act on later either.
  return NextResponse.json({ ok: true });
}
