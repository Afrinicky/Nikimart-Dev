import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
 * we hand it carries a shared secret (DATA_WEBHOOK_SECRET) plus the reference
 * of the order it belongs to. That means a caller must already know the secret
 * *and* a valid reference, and even then can only move that one order's status.
 * Without the secret configured we register no callback at all and reject
 * everything here.
 */

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.DATA_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Callbacks are not enabled." }, { status: 404 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!tokenMatches(token, secret)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const reference = (url.searchParams.get("ref") ?? "").trim();
  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
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
