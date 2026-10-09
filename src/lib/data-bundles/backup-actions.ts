"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { runDataBackup } from "@/lib/data-bundles/backup";
import { DATA_SETTINGS_TAG, getDataSettings, saveDataSettings } from "@/lib/data-bundles/settings";

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

/**
 * The automatic-backup schedule: whether it runs, and how much it keeps.
 *
 * Separate from `updateDataSettings` because it belongs to a different screen
 * and validates different things, but it writes through the same
 * `saveDataSettings`, which only touches the keys it is given — so saving here
 * cannot disturb a price on the Storefront tab.
 */

export interface BackupScheduleState {
  ok?: boolean;
  error?: string;
}

const RETENTION_FIELDS: Array<[string, string]> = [
  ["backupRetainDaily", "Daily backups to keep"],
  ["backupRetainWeekly", "Weekly backups to keep"],
  ["backupRetainMonthly", "Monthly backups to keep"],
];

export async function updateBackupSchedule(
  _prev: BackupScheduleState,
  formData: FormData,
): Promise<BackupScheduleState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Only an administrator may change the backup schedule." };
  }

  const entries: Record<string, string> = {};

  for (const [key, label] of RETENTION_FIELDS) {
    if (!formData.has(key)) continue;
    const raw = String(formData.get(key) ?? "").trim();
    // A blank field is rejected rather than read as a number. `Number("")` is
    // 0, so clearing a box and pressing save would otherwise be taken as
    // "keep none of this tier" and start deleting every snapshot in it — a
    // destructive setting arrived at by deleting three characters.
    if (raw === "") {
      return { error: `${label} cannot be blank. Enter 0 to keep none of that tier.` };
    }
    const n = Number(raw);
    // Zero is allowed and means "keep none of this tier" — a real choice for
    // somebody who only wants monthlies. Anything else must be a whole number.
    if (!Number.isInteger(n) || n < 0 || n > 3650) {
      return { error: `${label} must be a whole number between 0 and 3650.` };
    }
    entries[key] = String(n);
  }

  if (formData.has("backupAutoEnabled")) {
    entries.backupAutoEnabled =
      String(formData.get("backupAutoEnabled") ?? "") === "1" ? "1" : "0";
  }

  if (Object.keys(entries).length === 0) return { ok: true };

  // Checked against what the settings would actually become, not just against
  // what this form sent: a field left out of the submission keeps its stored
  // value, and three zeroes reached that way are as destructive as three typed
  // in at once.
  const current = await getDataSettings();
  const effective = (key: "backupRetainDaily" | "backupRetainWeekly" | "backupRetainMonthly") =>
    entries[key] ?? current[key];
  const enabled = entries.backupAutoEnabled ?? current.backupAutoEnabled;

  if (
    enabled === "1" &&
    effective("backupRetainDaily") === "0" &&
    effective("backupRetainWeekly") === "0" &&
    effective("backupRetainMonthly") === "0"
  ) {
    return {
      error:
        "Keeping none of all three tiers would delete each snapshot as soon as the next one is taken. Keep at least one.",
    };
  }

  await saveDataSettings(entries);
  updateTag(DATA_SETTINGS_TAG);
  revalidatePath("/admin/data/settings/backups");
  return { ok: true };
}
