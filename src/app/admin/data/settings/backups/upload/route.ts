import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { dataDb } from "@/lib/data-db";
import {
  BACKUP_CONTENT_TYPE,
  backupFileName,
  buildBackupId,
} from "@/lib/data-bundles/backup-format";
import { randomBytes } from "node:crypto";
import { parseBackupFile, BackupFileError } from "@/lib/data-bundles/backup-file";
import { putBackupFile } from "@/lib/data-bundles/backup-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Take a backup file from an admin's machine.
 *
 * A route rather than a server action because a server action's body is capped
 * at a megabyte by default, and a real backup is not a megabyte. The browser
 * posts the file as the raw request body — no multipart, nothing to parse
 * before the size has been checked.
 *
 * The file is validated in full before it is stored and long before anything
 * could restore from it, and it is stored the same way our own backups are, so
 * the restore screen has one kind of thing to work with: a backup id.
 */

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, private",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function problem(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/** Ceiling on the compressed upload. Raise with the backup size limit if the business outgrows it. */
function maxUploadBytes(): number {
  const configured = Number(process.env.DATA_BACKUP_MAX_UPLOAD_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 256 * 1024 * 1024;
}

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return problem(403, "Forbidden");
  }

  // Checked before reading, where it still costs nothing.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxUploadBytes()) {
    return problem(413, "That file is larger than the upload limit for backups.");
  }

  let body: Buffer;
  try {
    body = Buffer.from(await req.arrayBuffer());
  } catch {
    return problem(400, "The upload did not complete.");
  }
  if (body.byteLength === 0) return problem(400, "The upload was empty.");
  // And again after reading, because content-length is the sender's claim.
  if (body.byteLength > maxUploadBytes()) {
    return problem(413, "That file is larger than the upload limit for backups.");
  }

  let parsed;
  try {
    parsed = parseBackupFile(body);
  } catch (error) {
    if (error instanceof BackupFileError) return problem(400, error.message);
    console.error("[data-backup] upload could not be read", error);
    return problem(400, "That file could not be read as a Nickimart backup.");
  }

  // Stored under an id of our own. The id inside the file belongs to whichever
  // database produced it, which may not be this one, and may already be here.
  const now = new Date();
  const id = buildBackupId(now, randomBytes(4).toString("hex"));
  const fileName = backupFileName(id);
  const checksum = createHash("sha256").update(body).digest("hex");

  const locations = await putBackupFile(fileName, body, BACKUP_CONTENT_TYPE);
  const stored = locations.filter((l) => l.ok);
  if (stored.length === 0) {
    return problem(
      500,
      `The file was valid but could not be stored. ${locations.map((l) => `${l.label}: ${l.error ?? "failed"}`).join("; ")}`,
    );
  }
  const primary = stored.find((l) => l.driver === "s3") ?? stored[0];

  try {
    await dataDb.dataBackup.create({
      data: {
        id,
        kind: "uploaded",
        status: "completed",
        format: `${parsed.meta.format}/${parsed.meta.formatVersion}`,
        fileName,
        tableCount: parsed.meta.tableCount,
        recordCount: parsed.meta.recordCount,
        byteSize: body.byteLength,
        checksum,
        databaseId: parsed.meta.databaseId,
        schemaVersion: parsed.meta.schemaVersion,
        appVersion: parsed.meta.appVersion,
        storage: primary.driver,
        storageKey: primary.key,
        storageTargets: JSON.stringify(locations),
        manifest: JSON.stringify(parsed.meta.counts),
        createdById: admin.id,
        createdByEmail: admin.email ?? "",
        startedAt: now,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[data-backup] upload could not be recorded", error);
    return problem(500, "The file was stored but could not be recorded in the backup history.");
  }

  console.log(`[data-backup] ${id} uploaded by ${admin.email ?? admin.id}`);

  return NextResponse.json(
    {
      id,
      takenAt: parsed.meta.takenAt.toISOString(),
      tableCount: parsed.meta.tableCount,
      recordCount: parsed.meta.recordCount,
      databaseId: parsed.meta.databaseId,
      schemaVersion: parsed.meta.schemaVersion,
    },
    { headers: NO_STORE },
  );
}
