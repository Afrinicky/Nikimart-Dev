import "server-only";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/site";
import {
  inviteProblem,
  inviteUsable,
  newInviteCode,
  normaliseInviteCode,
  type InviteProblem,
} from "@/lib/data-bundles/invite-rules";

/**
 * Registration links Nickimart issues to affiliates itself.
 *
 * The same idea as the bundle programme's, and deliberately the same rules —
 * what retires a link, and what discount it is worth, is imported from
 * invite-rules rather than written again. What is different is only the table
 * and the page the link opens.
 *
 * Reads and writes only. Nothing here decides whether a link may be used.
 */

export interface AffiliateInviteRow {
  id: string;
  code: string;
  label: string;
  waiverPercent: number;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

/** The public link for a code. */
export function affiliateInviteUrl(code: string): string {
  return `${siteUrl()}/become-an-affiliate?invite=${encodeURIComponent(code)}`;
}

export async function listAffiliateInvites(take = 50): Promise<AffiliateInviteRow[]> {
  try {
    return await prisma.affiliateInvite.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take,
      select: {
        id: true,
        code: true,
        label: true,
        waiverPercent: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
    });
  } catch {
    return []; // table not migrated yet
  }
}

export async function createAffiliateInvite(input: {
  label: string;
  waiverPercent: number;
  maxUses: number;
  expiresAt: Date | null;
  createdBy: string;
}): Promise<AffiliateInviteRow | null> {
  // A handful of attempts, because the code is short enough to collide and the
  // unique index is what decides, not a pre-check.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await prisma.affiliateInvite.create({
        data: {
          code: newInviteCode(),
          label: input.label,
          waiverPercent: input.waiverPercent,
          maxUses: input.maxUses,
          expiresAt: input.expiresAt,
          createdBy: input.createdBy,
        },
      });
    } catch {
      if (attempt === 5) return null;
    }
  }
  return null;
}

export async function setAffiliateInviteActive(id: string, isActive: boolean): Promise<void> {
  await prisma.affiliateInvite.updateMany({ where: { id }, data: { isActive } }).catch(() => {});
}

export async function deleteAffiliateInvite(id: string): Promise<void> {
  await prisma.affiliateInvite.delete({ where: { id } }).catch(() => {});
}

export type AffiliateInviteLookup =
  | { ok: true; invite: AffiliateInviteRow }
  | { ok: false; problem: InviteProblem | "unknown" };

/**
 * Resolve a code from a link. Never throws and never guesses: an unknown or
 * retired code simply means the applicant pays the normal fee.
 */
export async function resolveAffiliateInvite(
  code: string | null | undefined,
): Promise<AffiliateInviteLookup> {
  const normalised = normaliseInviteCode(code);
  if (!normalised) return { ok: false, problem: "unknown" };

  const invite = await prisma.affiliateInvite
    .findUnique({ where: { code: normalised } })
    .catch(() => null);
  if (!invite) return { ok: false, problem: "unknown" };

  const problem = inviteProblem(invite);
  return problem ? { ok: false, problem } : { ok: true, invite };
}

/**
 * Count one use of a link, and only while it is still usable.
 *
 * The guard is in the update itself: two applications submitted at the same
 * moment against a one-use link would otherwise both read a count of zero and
 * both be discounted.
 */
export async function consumeAffiliateInvite(code: string): Promise<boolean> {
  const normalised = normaliseInviteCode(code);
  if (!normalised) return false;

  const invite = await prisma.affiliateInvite
    .findUnique({ where: { code: normalised } })
    .catch(() => null);
  if (!invite || !inviteUsable(invite)) return false;

  const claimed = await prisma.affiliateInvite
    .updateMany({
      where: {
        code: normalised,
        isActive: true,
        // Re-tested here rather than trusted from the read above.
        ...(invite.maxUses > 0 ? { usedCount: { lt: invite.maxUses } } : {}),
      },
      data: { usedCount: { increment: 1 } },
    })
    .catch(() => ({ count: 0 }));

  return claimed.count > 0;
}
