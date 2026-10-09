import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { takeDirectBackup } from "@/lib/data-bundles/backup";
import { BACKUP_CONTENT_TYPE } from "@/lib/data-bundles/backup-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A full dump, then straight down the wire. Bounded by the size of the
// database rather than by a handful of queries.
export const maxDuration = 300;

/**
 * Take a snapshot and send it to the browser, storing nothing.
 *
 * The stored path remains the one to rely on — a backup nobody can find later
 * is not a backup — but it should never have been the *only* way to get a copy
 * of your own database. An admin whose bucket is misconfigured, or who has not
 * set one up at all, can still take a real backup and keep it on their own
 * machine, which is a perfectly good recovery plan and the only one that
 * depends on nothing but this request.
 *
 * Same guard as the stored download: `requireAdmin` re-reads the role from the
 * database, and the response is uncacheable, because a shared cache holding a
 * copy of the whole business is its own breach.
 */

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, private",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export async function GET() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    // `requireAdmin` redirects a signed-out caller, which is useless to a
    // download, so the redirect becomes a 403 like everywhere else here.
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  const result = await takeDirectBackup({ byId: admin.id, byEmail: admin.email ?? "" });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500, headers: NO_STORE });
  }

  return new NextResponse(new Uint8Array(result.body), {
    headers: {
      ...NO_STORE,
      "Content-Type": BACKUP_CONTENT_TYPE,
      "Content-Length": String(result.body.byteLength),
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
