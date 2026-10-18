import "server-only";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/site";
import {
  inviteProblem,
  inviteUsable,
  isReservedInviteSlug,
  newInviteCode,
  normaliseInviteCode,
  normaliseInviteSlug,
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
  /** An advert-friendly short path for the same link, or null. */
  slug: string | null;
  label: string;
  waiverPercent: number;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * The public link for a code.
 *
 * Always works, and always says what it is. This is the link to send one
 * person, and the fallback for a link that never claimed a short path.
 */
export function affiliateInviteUrl(code: string): string {
  return `${siteUrl()}/become-an-affiliate?invite=${encodeURIComponent(code)}`;
}

/**
 * The link to put in an advert, when this one has a short path.
 *
 * Bare path, no query string: that is the whole difference, and the reason the
 * column exists. Falls back to the code link so a caller never has to branch —
 * including when the path is one the app itself now owns, which a link created
 * before that route existed can be. Handing back a URL that opens a different
 * page is worse than handing back the longer one that works.
 */
export function affiliateInviteShareUrl(
  invite: Pick<AffiliateInviteRow, "code" | "slug">,
): string {
  if (!invite.slug || isReservedInviteSlug(invite.slug)) return affiliateInviteUrl(invite.code);
  return `${siteUrl()}/${invite.slug}`;
}

export async function listAffiliateInvites(take = 50): Promise<AffiliateInviteRow[]> {
  try {
    return await prisma.affiliateInvite.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take,
      select: {
        id: true,
        code: true,
        slug: true,
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

export interface CreatedAffiliateInvite {
  invite: AffiliateInviteRow;
  /** The label of the link this one took its short path from, if any. */
  slugTakenFrom: string | null;
}

export async function createAffiliateInvite(input: {
  label: string;
  slug: string | null;
  waiverPercent: number;
  maxUses: number;
  expiresAt: Date | null;
  createdBy: string;
}): Promise<CreatedAffiliateInvite | null> {
  const slug = input.slug ? normaliseInviteSlug(input.slug) : "";
  // A handful of attempts, because the code is short enough to collide and the
  // unique index is what decides, not a pre-check.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // A short path can only belong to one link, and an advert already
        // printed on a flyer is the reason to re-point it rather than refuse
        // it: the admin who types "earn" again means "/earn is this link now".
        // The old link keeps its code, its uses and its history — it just
        // stops owning the path.
        let slugTakenFrom: string | null = null;
        if (slug) {
          const held = await tx.affiliateInvite.findUnique({
            where: { slug },
            select: { id: true, label: true },
          });
          if (held) {
            slugTakenFrom = held.label || null;
            await tx.affiliateInvite.update({ where: { id: held.id }, data: { slug: null } });
          }
        }

        const invite = await tx.affiliateInvite.create({
          data: {
            code: newInviteCode(),
            slug: slug || null,
            label: input.label,
            waiverPercent: input.waiverPercent,
            maxUses: input.maxUses,
            expiresAt: input.expiresAt,
            createdBy: input.createdBy,
          },
        });
        return { invite, slugTakenFrom };
      });
    } catch {
      if (attempt === 5) return null;
    }
  }
  return null;
}

/**
 * Resolve a short path — nickimart.com/earn — to the link that owns it.
 *
 * `null` means no affiliate link claims that path. As with the agent
 * programme's, this does not test whether the link still works: a path that
 * has expired or been switched off still belongs to its link, and the page
 * shows the notice for it — an advert that has already run is better met by
 * "that offer has ended, you can still register" than by a 404.
 */
export async function resolveAffiliateInviteBySlug(
  slug: string | null | undefined,
): Promise<AffiliateInviteRow | null> {
  const normalised = normaliseInviteSlug(slug);
  if (!normalised || isReservedInviteSlug(normalised)) return null;

  return await prisma.affiliateInvite
    .findUnique({ where: { slug: normalised } })
    .catch(() => null);
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
