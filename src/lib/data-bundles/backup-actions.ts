"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { runDataBackup } from "@/lib/data-bundles/backup";

/**
 * The "Create Full Backup" button's action.
 *
 * `requireAdmin` reads the caller's role out of the database rather than off
 * the session token, so an account demoted since it signed in cannot take a
 * copy of the entire business on the way out. It throws for a non-admin and
 * redirects a signed-out caller; both are turned into a plain message here,
 * because a server action's rejection reaches the browser as an opaque error
 * and tells the admin nothing.
 */

export interface BackupActionState {
  ok?: boolean;
  error?: string;
  /** What completed, for the line under the button. */
  summary?: string;
  /** Stored, but not everywhere we tried. */
  warning?: string;
  /** Set when a new backup is ready to download. */
  backupId?: string;
}

export async function createDataBackup(
  _prev: BackupActionState,
  _formData: FormData,
): Promise<BackupActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { error: "Only an administrator may create a backup." };
  }

  const result = await runDataBackup({
    kind: "manual",
    byId: admin.id,
    byEmail: admin.email ?? "",
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/admin/data/settings/backups");

  const { backup } = result;
  return {
    ok: true,
    backupId: backup.id,
    warning: result.warning,
    summary: `${backup.tableCount} tables and ${backup.recordCount.toLocaleString("en-GB")} records captured.`,
  };
}
