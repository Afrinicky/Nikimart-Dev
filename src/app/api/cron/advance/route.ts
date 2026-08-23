import { NextResponse } from "next/server";
import { sweepRateLimits } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * General housekeeping, on whatever schedule the cron is wired to.
 *
 * Shipment progression is no longer driven by elapsed time — sellers, freight
 * agents and pickup operators confirm their own stage — so this route stopped
 * advancing anything and was kept only so existing cron wiring kept returning
 * 200. It now earns its keep by clearing rate-limit windows that have already
 * ended, which nothing else would ever delete.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const rateLimitsCleared = await sweepRateLimits();
  return NextResponse.json({
    ok: true,
    advanced: 0,
    rateLimitsCleared,
    note: "Manual role-based confirmations; no time-based advance.",
  });
}
