import "server-only";
import { dataDb } from "@/lib/data-db";
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
 * Registration links Nickimart issues itself.
 *
 * Reads and writes only; what makes a link usable, and what discount it is
 * worth, lives in invite-rules so it can be tested without a database.
 */

export interface AgentInvite {
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
 * Always works, and always says what it is. This is the link to share with one
 * person, and the fallback for a link that never claimed a short path.
 */
export function inviteUrl(code: string): string {
  return `${siteUrl()}/become-an-agent?invite=${encodeURIComponent(code)}`;
}

/**
 * The link to put in an advert, when this one has a short path.
 *
 * Bare path, no query string: that is the whole difference, and the reason the
 * column exists. Falls back to the code link so a caller never has to branch —
 * including when the path is one the app itself now owns, which a link created
 * before that route existed can be, and which resolveAgentInviteBySlug would
 * refuse. Handing back a URL that opens a different page is worse than handing
 * back the longer one that works.
 */
export function inviteShareUrl(invite: Pick<AgentInvite, "code" | "slug">): string {
  if (!invite.slug || isReservedInviteSlug(invite.slug)) return inviteUrl(invite.code);
  return `${siteUrl()}/${invite.slug}`;
}

export async function listAgentInvites(take = 50): Promise<AgentInvite[]> {
  try {
    return await dataDb.dataAgentInvite.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take,
    });
  } catch {
    return []; // table not migrated yet
  }
}

export interface CreatedAgentInvite {
  invite: AgentInvite;
  /** The label of the link this one took its short path from, if any. */
  slugTakenFrom: string | null;
}

export async function createAgentInvite(input: {
  label: string;
  slug: string | null;
  waiverPercent: number;
  maxUses: number;
  expiresAt: Date | null;
  createdBy: string | null;
}): Promise<CreatedAgentInvite | null> {
  const slug = input.slug ? normaliseInviteSlug(input.slug) : "";
  // A handful of attempts, because the code is short enough to collide and the
  // unique index is what decides, not a pre-check.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await dataDb.$transaction(async (tx) => {
        // A short path can only belong to one link, and an advert already
        // printed on a flyer is the reason to re-point it rather than refuse
        // it: the admin who types "join" again means "/join is this link now".
        // The old link keeps its code, its uses and its history — it just stops
        // owning the path.
        let slugTakenFrom: string | null = null;
        if (slug) {
          const held = await tx.dataAgentInvite.findUnique({
            where: { slug },
            select: { id: true, label: true },
          });
          if (held) {
            slugTakenFrom = held.label || null;
            await tx.dataAgentInvite.update({ where: { id: held.id }, data: { slug: null } });
          }
        }

        const invite = await tx.dataAgentInvite.create({
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

export async function setAgentInviteActive(id: string, isActive: boolean): Promise<void> {
  await dataDb.dataAgentInvite.updateMany({ where: { id }, data: { isActive } }).catch(() => {});
}

export async function deleteAgentInvite(id: string): Promise<void> {
  await dataDb.dataAgentInvite.delete({ where: { id } }).catch(() => {});
}

export type InviteLookup =
  | { ok: true; invite: AgentInvite }
  | { ok: false; problem: InviteProblem | "unknown" };

/**
 * Resolve a code from a link. Never throws and never guesses: an unknown or
 * retired code simply means the applicant pays the normal fee.
 */
export async function resolveAgentInvite(code: string | null | undefined): Promise<InviteLookup> {
  const normalised = normaliseInviteCode(code);
  if (!normalised) return { ok: false, problem: "unknown" };

  const invite = await dataDb.dataAgentInvite
    .findUnique({ where: { code: normalised } })
    .catch(() => null);
  if (!invite) return { ok: false, problem: "unknown" };

  const problem = inviteProblem(invite);
  return problem ? { ok: false, problem } : { ok: true, invite };
}

/**
 * Resolve a short path — nickimart.com/join — to the link that owns it.
 *
 * `null` means no link claims that path, which is how the route knows to answer
 * 404 rather than show a registration form at somebody's unrelated URL. A path
 * the app itself owns is never resolved here even if a row still holds one from
 * before it became a route, because the page at that path is the right answer.
 *
 * Note what this does *not* do: it does not test whether the link still works.
 * A path that has expired or been switched off still belongs to its link, and
 * the caller shows the notice for it — an advert that has already run is better
 * met by "that offer has ended, you can still register" than by a 404.
 */
export async function resolveAgentInviteBySlug(
  slug: string | null | undefined,
): Promise<AgentInvite | null> {
  const normalised = normaliseInviteSlug(slug);
  if (!normalised || isReservedInviteSlug(normalised)) return null;

  return await dataDb.dataAgentInvite
    .findUnique({ where: { slug: normalised } })
    .catch(() => null);
}

/**
 * Count one use of a link, and only while it is still usable.
 *
 * The guard is in the update itself: two applications submitted at the same
 * moment against a one-use link would otherwise both read a count of zero and
 * both be discounted. Returns whether this caller got the use.
 */
export async function consumeAgentInvite(code: string): Promise<boolean> {
  const normalised = normaliseInviteCode(code);
  if (!normalised) return false;

  const invite = await dataDb.dataAgentInvite
    .findUnique({ where: { code: normalised } })
    .catch(() => null);
  if (!invite || !inviteUsable(invite)) return false;

  const claimed = await dataDb.dataAgentInvite
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
