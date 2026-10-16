"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { clampPercent } from "@/lib/affiliate-team-rules";
import {
  affiliateInviteUrl,
  createAffiliateInvite,
  deleteAffiliateInvite,
  setAffiliateInviteActive,
} from "@/lib/affiliate-invites";

/**
 * Issuing and retiring affiliate registration links.
 *
 * Every export here is guarded: a link is a discount on Nickimart's own
 * registration fee, and 100% of it is a free affiliate account.
 */

export type InviteState = { ok?: boolean; error?: string; message?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function issueAffiliateInvite(
  _prev: InviteState,
  fd: FormData,
): Promise<InviteState> {
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

  const invite = await createAffiliateInvite({
    label,
    waiverPercent,
    maxUses,
    expiresAt,
    createdBy: admin.id,
  });
  if (!invite) {
    return { error: "Couldn't create that link — the invite table may not be migrated yet." };
  }

  revalidatePath("/admin/affiliates/invites");

  const price =
    waiverPercent >= 100
      ? "registration is free on it"
      : waiverPercent > 0
        ? `it takes ${waiverPercent}% off`
        : "it charges the normal fee";
  return {
    ok: true,
    message: `Link ${invite.code} is live — ${price}. ${affiliateInviteUrl(invite.code)}`,
  };
}

export async function toggleAffiliateInvite(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) await setAffiliateInviteActive(id, str(fd, "active") === "on");
  revalidatePath("/admin/affiliates/invites");
}

export async function removeAffiliateInvite(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) await deleteAffiliateInvite(id);
  revalidatePath("/admin/affiliates/invites");
}
