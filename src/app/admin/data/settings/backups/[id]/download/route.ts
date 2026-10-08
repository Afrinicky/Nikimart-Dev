import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { readDataBackup } from "@/lib/data-bundles/backup";
import { BACKUP_CONTENT_TYPE, isBackupId } from "@/lib/data-bundles/backup-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hand a stored Data Bundles backup to the admin who asked for it.
 *
 * A backup file is the entire business — every agent, every order, every
 * ledger row and every password hash in it — so this is the most sensitive
 * route in the console and it is written defensively:
 *
 *   - `requireAdmin` re-reads the role from the database. It redirects a
 *     signed-out caller, which is useless to a download, so the redirect is
 *     caught and turned into a 403.
 *   - The id is validated against the backup-id pattern before it is used for
 *     anything. It ends up in a filesystem path and an object key, and
 *     "matches `dbk_<stamp>_<hex>`" is what stops `../../etc/passwd`.
 *   - The checksum recorded when the snapshot was taken is verified inside
 *     `readDataBackup` before a single byte is sent.
 *   - Nothing here may be cached. A shared cache holding a copy of the whole
 *     database is its own breach, and a browser re-serving a stale one is a
 *     restore from the wrong day.
 */

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, private",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function problem(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return problem(403, "Forbidden");
  }

  const { id } = await params;
  if (!isBackupId(id)) return problem(400, "That is not a backup id.");

  const result = await readDataBackup(id);
  if (!result.ok) return problem(result.status, result.error);

  return new NextResponse(new Uint8Array(result.body), {
    headers: {
      ...NO_STORE,
      "Content-Type": BACKUP_CONTENT_TYPE,
      "Content-Length": String(result.body.byteLength),
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      // The file is already gzip; don't let a proxy try to compress it again
      // and don't let a browser treat it as a transfer encoding to undo.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
