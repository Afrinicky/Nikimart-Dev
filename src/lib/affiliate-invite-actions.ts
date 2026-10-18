"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { clampPercent } from "@/lib/affiliate-team-rules";
import {
  affiliateInviteShareUrl,
  createAffiliateInvite,
  deleteAffiliateInvite,
  setAffiliateInviteActive,
} from "@/lib/affiliate-invites";
import { inviteSlugProblem, normaliseInviteSlug } from "@/lib/data-bundles/invite-rules";
import { OWNER_LABELS, slugHeldElsewhere } from "@/lib/invite-slug-registry";
import { siteUrl } from "@/lib/site";

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

  // An optional short path, for a link that has to go in an advert. Refused
  // here when it names a page the site already has — Next.js answers that page
  // first, so the link would load somebody else's screen — and when the other
  // programme's console has already claimed it.
  const slug = normaliseInviteSlug(str(fd, "slug"));
  if (slug) {
    const slugError = inviteSlugProblem(slug);
    if (slugError) return { error: slugError };
    const held = await slugHeldElsewhere(slug, "affiliate");
    if (held) {
      return { error: `nickimart.com/${slug} already belongs to ${OWNER_LABELS[held]}. Pick another word.` };
    }
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

  const created = await createAffiliateInvite({
    label,
    slug: slug || null,
    waiverPercent,
    maxUses,
    expiresAt,
    createdBy: admin.id,
  });
  if (!created) {
    return { error: "Couldn't create that link — the invite table may not be migrated yet." };
  }
  const { invite, slugTakenFrom } = created;

  revalidatePath("/admin/affiliates/invites");
  // The path may have been a 404 a moment ago, and Next.js remembers a 404 for
  // a path in the router cache; this makes it live immediately rather than on
  // whatever the next cold request happens to be.
  if (invite.slug) revalidatePath(`/${invite.slug}`);

  const price =
    waiverPercent >= 100
      ? "registration is free on it"
      : waiverPercent > 0
        ? `it takes ${waiverPercent}% off`
        : "it charges the normal fee";
  const where = invite.slug
    ? `${siteUrl().replace(/^https?:\/\//, "")}/${invite.slug}`
    : `Link ${invite.code}`;
  // Re-pointing a path is deliberate and reversible, but it is also invisible
  // from the table, so it is said out loud: the admin has just changed where
  // an advert that is already running sends people.
  const moved = slugTakenFrom
    ? ` It was pointing at “${slugTakenFrom}”, which keeps its own code.`
    : "";

  return {
    ok: true,
    message: `${where} is live — ${price}.${moved} ${affiliateInviteShareUrl(invite)}`,
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
