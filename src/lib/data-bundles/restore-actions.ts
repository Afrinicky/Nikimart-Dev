"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { isBackupId } from "@/lib/data-bundles/backup-format";
import {
  RESTORE_CONFIRMATION,
  loadBackupBytes,
  planRestore,
  runRestore,
  type RestorePlan,
  type RestoreVerification,
} from "@/lib/data-bundles/restore";

/**
 * The two halves of a restore, as the console performs them: look first, then
 * confirm.
 *
 * They are separate actions rather than one because the admin has to be shown
 * what the file would do — its date, its tables, its record counts, and every
 * way it disagrees with the live schema — and be able to walk away after
 * reading it. The preview writes nothing at all.
 *
 * Both re-check the role against the database, and the second re-validates the
 * file from scratch: the preview happened in another request and proves
 * nothing about this one.
 */

export interface RestorePreviewState {
  error?: string;
  plan?: RestorePlan;
  backupId?: string;
  /** What the file is called where it is stored, for the confirmation copy. */
  label?: string;
}

export interface RestoreRunState {
  error?: string;
  ok?: boolean;
  restoreId?: string;
  safetyBackupId?: string;
  tables?: number;
  rows?: number;
  verification?: RestoreVerification[];
}

async function admin() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

export async function previewRestore(
  _prev: RestorePreviewState,
  formData: FormData,
): Promise<RestorePreviewState> {
  if (!(await admin())) return { error: "Only an administrator may restore a backup." };

  const backupId = String(formData.get("backupId") ?? "").trim();
  if (!isBackupId(backupId)) return { error: "Choose a backup to inspect." };

  const loaded = await loadBackupBytes(backupId);
  if (!loaded.ok) return { error: loaded.error };

  const planned = await planRestore(loaded.body);
  if (!planned.ok) return { error: planned.error };

  return { plan: planned.plan, backupId, label: loaded.label };
}

export async function executeRestore(
  _prev: RestoreRunState,
  formData: FormData,
): Promise<RestoreRunState> {
  const user = await admin();
  if (!user) return { error: "Only an administrator may restore a backup." };

  const backupId = String(formData.get("backupId") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "");
  if (!isBackupId(backupId)) return { error: "Choose a backup to restore." };
  if (confirmation.trim() !== RESTORE_CONFIRMATION) {
    return { error: `Type ${RESTORE_CONFIRMATION} exactly to confirm.` };
  }

  const loaded = await loadBackupBytes(backupId);
  if (!loaded.ok) return { error: loaded.error };

  const result = await runRestore({
    file: loaded.body,
    source: loaded.label,
    sourceBackupId: backupId,
    confirmation,
    byId: user.id,
    byEmail: user.email ?? "",
  });

  revalidatePath("/admin/data/settings/backups");

  if (!result.ok) {
    return {
      error: result.error,
      restoreId: result.restoreId,
      safetyBackupId: result.safetyBackupId,
    };
  }
  return {
    ok: true,
    restoreId: result.restoreId,
    safetyBackupId: result.safetyBackupId,
    tables: result.tables,
    rows: result.rows,
    verification: result.verification,
  };
}
