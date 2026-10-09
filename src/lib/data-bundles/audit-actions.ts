"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { applyAuditFix, isAuditFix } from "@/lib/data-bundles/audit";
import {
  addProviderEntry,
  removeProviderEntry,
  type ProviderEntryKind,
} from "@/lib/data-bundles/provider-ledger";

/**
 * The write side of the audit, and of the movements it asks an administrator
 * to declare.
 *
 * `requireAdmin` reads the role from the database rather than off the session
 * token, so an account demoted since it signed in cannot correct the books on
 * the way out. Its rejection is turned into a message here, because a server
 * action's throw reaches the browser as an opaque error and tells the admin
 * nothing.
 */

const AUDIT_PATHS = [
  "/admin/data/transactions/audit",
  "/admin/data/transactions/topups",
  "/admin/data/transactions",
  "/admin/data",
];

function refresh() {
  for (const path of AUDIT_PATHS) revalidatePath(path);
}

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------

export interface AuditActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

export async function applyCorrection(
  _prev: AuditActionState,
  formData: FormData,
): Promise<AuditActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { error: "Only an administrator may correct the books." };
  }

  const action = String(formData.get("action") ?? "");
  if (!isAuditFix(action)) return { error: "That correction is not one this console knows." };

  const result = await applyAuditFix(action, admin.email ?? "");
  refresh();
  return result.ok ? { ok: true, message: result.message } : { error: result.message };
}

// ---------------------------------------------------------------------------
// Declared movements on the provider wallet
// ---------------------------------------------------------------------------

export interface ProviderEntryState {
  ok?: boolean;
  error?: string;
  message?: string;
}

export async function recordProviderEntry(
  _prev: ProviderEntryState,
  formData: FormData,
): Promise<ProviderEntryState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { error: "Only an administrator may record a movement." };
  }

  const kind = String(formData.get("kind") ?? "FUNDING");
  if (kind !== "FUNDING" && kind !== "DEBIT") return { error: "Choose funding or spending." };

  const raw = String(formData.get("amount") ?? "").trim();
  if (raw === "") return { error: "Enter the amount." };
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return { error: "Enter the amount in cedis, as a number." };

  // A date without a time is midnight local to the server, which is near
  // enough: these are movements being placed in history, not timed to the
  // second. A blank date means today, which is the common case.
  const dateRaw = String(formData.get("occurredAt") ?? "").trim();
  const occurredAt = dateRaw ? new Date(`${dateRaw}T12:00:00`) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return { error: "Enter a valid date." };

  const result = await addProviderEntry({
    kind: kind as ProviderEntryKind,
    amount,
    occurredAt,
    note: String(formData.get("note") ?? ""),
    byId: admin.id,
    byEmail: admin.email ?? "",
  });

  if (!result.ok) return { error: result.error };

  refresh();
  return {
    ok: true,
    message:
      kind === "FUNDING"
        ? "Funding recorded. It now counts towards what has been put into the wallet."
        : "Spending recorded. It now accounts for money that left the wallet.",
  };
}

export async function deleteProviderEntry(
  _prev: ProviderEntryState,
  formData: FormData,
): Promise<ProviderEntryState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Only an administrator may remove a movement." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Nothing to remove." };

  const removed = await removeProviderEntry(id);
  refresh();
  return removed
    ? { ok: true, message: "Entry removed." }
    : { error: "That entry could not be removed." };
}
