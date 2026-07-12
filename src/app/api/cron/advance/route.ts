import { NextResponse } from "next/server";
import { advanceAllShipments } from "@/lib/tracking";

// Advances all non-held shipments to their expected stage based on elapsed
// time. Wired to a daily Vercel Cron (see vercel.json; Hobby plans cap crons at
// once/day). Day-to-day progression is handled on read; this is a backstop for
// orders nobody views. Also safe to hit manually.
// If CRON_SECRET is set, the request must include `Authorization: Bearer <secret>`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const changed = await advanceAllShipments();
    return NextResponse.json({ ok: true, advanced: changed });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
