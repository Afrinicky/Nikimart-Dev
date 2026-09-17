"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { clampPercent } from "@/lib/data-bundles/referral-rules";
import {
  createAgentInvite,
  deleteAgentInvite,
  setAgentInviteActive,
} from "@/lib/data-bundles/invites";

/**
 * Issuing and retiring registration links, from the admin console.
 *
 * Every export here is guarded: a link is a discount on Nickimart's own
 * registration fee, and 100% of it is a free agent account.
 */

export type InviteState = { ok?: boolean; error?: string; message?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function issueInvite(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const admin = await requireAdmin();

  const label = str(fd, "label").slice(0, 80);
  if (label.length < 2) return { error: "Give the link a name, so you know what it was for." };

  const waiverRaw = Number(str(fd, "waiverPercent"));
  if (!Number.isFinite(waiverRaw) || waiverRaw < 0 || waiverRaw > 100) {
    return { error: "The discount must be between 0 and 100 percent." };
  }
  const waiverPercent = clampPercent(waiverRaw);

  const maxUsesRaw = str(fd, "maxUses");
  const maxUses = maxUsesRaw ? Number(maxUsesRaw) : 0;
  if (!Number.isInteger(maxUses) || maxUses < 0 || maxUses > 10000) {
    return { error: "Uses must be a whole number, or blank for unlimited." };
  }

  const expiresRaw = str(fd, "expiresAt");
  let expiresAt: Date | null = null;
  if (expiresRaw) {
    // A date input gives a plain day; the link is good until the end of it.
    const parsed = new Date(`${expiresRaw}T23:59:59`);
    if (Number.isNaN(parsed.getTime())) return { error: "That expiry date isn't valid." };
    if (parsed.getTime() <= Date.now()) return { error: "The expiry date has already passed." };
    expiresAt = parsed;
  }

  const invite = await createAgentInvite({
    label,
    waiverPercent,
    maxUses,
    expiresAt,
    createdBy: admin.id,
  });
  if (!invite) {
    return { error: "Couldn't create that link — the invite table may not be migrated yet." };
  }

  revalidatePath("/admin/data/invites");
  return {
    ok: true,
    message:
      waiverPercent >= 100
        ? `Link ${invite.code} created — registration is free on it.`
        : `Link ${invite.code} created at ${waiverPercent}% off.`,
  };
}

export async function toggleInvite(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) await setAgentInviteActive(id, str(fd, "active") === "on");
  revalidatePath("/admin/data/invites");
}

export async function removeInvite(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) await deleteAgentInvite(id);
  revalidatePath("/admin/data/invites");
}
