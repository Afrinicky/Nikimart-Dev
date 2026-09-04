import { NextResponse } from "next/server";
import { refreshCurrencyRates } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pull today's exchange rates.
 *
 * A forwarder quotes in dollars and the buyer pays cedis, so this one figure
 * decides what every imported listing costs. Leaving it to somebody to remember
 * meant it was right the day it was typed and silently wrong afterwards — and
 * the wrongness only ever goes one way, because the cedi does.
 *
 * The daily pull rides on `/api/cron/advance`, which runs on the same schedule
 * — cron slots are limited and two jobs on one nightly tick is one job's worth
 * of them. This route is the one to call by hand, from the currencies screen or
 * from a terminal, on a day the cedi does not wait for the cron.
 *
 * A failure is reported and changes nothing: yesterday's rates stand.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await refreshCurrencyRates();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
