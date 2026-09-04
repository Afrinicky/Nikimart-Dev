import { NextResponse } from "next/server";
import { sweepRateLimits } from "@/lib/rate-limit";
import { refreshCurrencyRates } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * General housekeeping, on whatever schedule the cron is wired to.
 *
 * Shipment progression is no longer driven by elapsed time — sellers, freight
 * agents and pickup operators confirm their own stage — so this route stopped
 * advancing anything and was kept only so existing cron wiring kept returning
 * 200. It now earns its keep with the two jobs that have to happen daily and
 * that nothing else would ever do: clearing rate-limit windows that have
 * already ended, and pulling the day's exchange rates.
 *
 * The rates ride along here rather than on a cron of their own because the
 * schedule is the same and cron slots are not free. `/api/cron/rates` still
 * exists for a manual pull; this is the one that runs by itself.
 *
 * Neither job can fail the other: a rates service having a bad morning must not
 * stop the rate-limit sweep, and a stale rate is reported rather than thrown.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const [rateLimitsCleared, rates] = await Promise.all([
    sweepRateLimits(),
    refreshCurrencyRates(),
  ]);

  return NextResponse.json({
    ok: true,
    advanced: 0,
    rateLimitsCleared,
    exchangeRates: rates.ok
      ? { updated: rates.updated, skipped: rates.skipped }
      : { error: rates.error },
    note: "Manual role-based confirmations; no time-based advance.",
  });
}
