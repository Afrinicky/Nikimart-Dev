import { NextResponse } from "next/server";

// Shipment progression is now driven by role-based confirmations (sellers,
// freight agents, and pickup operators confirm their own stage), not by elapsed
// time. This endpoint is kept as a no-op so any existing cron wiring keeps
// returning 200 instead of erroring.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return NextResponse.json({ ok: true, advanced: 0, note: "Manual role-based confirmations; no time-based advance." });
}
