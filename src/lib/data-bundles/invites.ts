import "server-only";
import { dataDb } from "@/lib/data-db";
import { siteUrl } from "@/lib/site";
import {
  inviteProblem,
  inviteUsable,
  newInviteCode,
  normaliseInviteCode,
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
  label: string;
  waiverPercent: number;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

/** The public link for a code. */
export function inviteUrl(code: string): string {
  return `${siteUrl()}/become-an-agent?invite=${encodeURIComponent(code)}`;
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

export async function createAgentInvite(input: {
  label: string;
  waiverPercent: number;
  maxUses: number;
  expiresAt: Date | null;
  createdBy: string | null;
}): Promise<AgentInvite | null> {
  // A handful of attempts, because the code is short enough to collide and the
  // unique index is what decides, not a pre-check.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await dataDb.dataAgentInvite.create({
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
