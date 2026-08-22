import { NextResponse } from "next/server";
import { runDataBundleSweep } from "@/lib/data-bundles/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The sweep talks to the provider once per stalled order; give it room.
export const maxDuration = 60;

/**
 * Scheduled safety net for the bundle store (see lib/data-bundles/monitor.ts).
 *
 * Guarded by CRON_SECRET, matching /api/cron/advance. Vercel sends that as a
 * Bearer token on its cron requests; when the variable isn't set the route is
 * open, which is the same trade the existing cron makes — it only re-drives
 * work that was already paid for and can't be made to do anything else.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runDataBundleSweep();
  return NextResponse.json({ ok: true, ...result });
}
