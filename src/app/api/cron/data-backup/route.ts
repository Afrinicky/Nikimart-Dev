import { NextResponse } from "next/server";
import { runScheduledBackup } from "@/lib/data-bundles/backup-schedule";
import { denyCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A full dump plus the prune. Longer than the other crons because this one is
// bounded by the size of the database rather than by a handful of API calls.
export const maxDuration = 300;

/**
 * The nightly Data Bundles snapshot.
 *
 * CRON_SECRET is required, as it is for every scheduled route now — see
 * src/lib/cron-auth.ts for why the others stopped being exceptions. This one
 * was never one: it writes a copy of the entire business to storage on demand,
 * so an open endpoint would be both a way to fill a bucket at somebody else's
 * expense and a way to make the database do a full read whenever a stranger
 * liked. With no secret set it refuses, and the console's Backups tab says so
 * in as many words rather than leaving an admin to wonder why no snapshots
 * appear.
 */
export async function GET(request: Request) {
  const denied = denyCron(request);
  if (denied) return denied;

  const result = await runScheduledBackup();
  // A skipped or failed run is reported as 200 with its reason: the schedule
  // did what it was asked and the outcome is in the body and in the backup
  // history, which is where an admin looks. A non-2xx here would only make the
  // platform retry a dump that is going to fail again for the same reason.
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
