import "server-only";
import { dataDb } from "@/lib/data-db";
import { getAgentForUser } from "@/lib/data-bundles/agents";

/**
 * Who is in whose team, and who is allowed to look.
 *
 * The hierarchy is not a new structure. An agent's recruiter is already
 * recorded on their row, and that chain is what the referral programme pays
 * on — so the team is that chain read downwards rather than a second copy of
 * it that could disagree. Nothing here writes.
 *
 * Two levels deep, because two levels is what the programme pays: a tree
 * showing a third would be showing a leader people they earn nothing from.
 */

export interface TeamScope {
  leaderId: string;
  /** People who joined with the leader's own code. */
  directIds: string[];
  /** People those recruits brought in. */
  indirectIds: string[];
  /** Both, for the reads that do not care which level somebody sits on. */
  allIds: string[];
}

/** The ids that make up one leader's team. One query per level, no recursion. */
export async function getTeamScope(leaderId: string): Promise<TeamScope> {
  const direct = await dataDb.dataAgent
    .findMany({ where: { referredById: leaderId }, select: { id: true } })
    .catch((): { id: string }[] => []);
  const directIds = direct.map((d) => d.id);

  const indirect = directIds.length
    ? await dataDb.dataAgent
        .findMany({ where: { referredById: { in: directIds } }, select: { id: true } })
        .catch((): { id: string }[] => [])
    : [];
  const indirectIds = indirect.map((d) => d.id);

  return { leaderId, directIds, indirectIds, allIds: [...directIds, ...indirectIds] };
}

/**
 * The agent behind the signed-in user, refused unless they have one.
 *
 * Every team screen starts here rather than trusting an id from the browser:
 * a leader is whoever is signed in, never whoever the URL says.
 */
export async function currentTeamLeader(userId: string) {
  return getAgentForUser(userId);
}

export type MemberLevel = 1 | 2;

/**
 * Whether this leader may look at this member, and at what distance.
 *
 * The permission check for every member screen. A leader sees their own two
 * levels and nothing else — not a sibling's team, not their own upline's
 * other recruits — so an id typed into the address bar gets the same answer as
 * one clicked from the list.
 */
export async function memberLevelFor(
  leaderId: string,
  memberId: string,
): Promise<MemberLevel | null> {
  if (!memberId || memberId === leaderId) return null;

  const member = await dataDb.dataAgent
    .findUnique({ where: { id: memberId }, select: { referredById: true } })
    .catch(() => null);
  if (!member?.referredById) return null;

  if (member.referredById === leaderId) return 1;

  const parent = await dataDb.dataAgent
    .findUnique({ where: { id: member.referredById }, select: { referredById: true } })
    .catch(() => null);
  return parent?.referredById === leaderId ? 2 : null;
}
