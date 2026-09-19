import "server-only";
import { dataDb } from "@/lib/data-db";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { getTeamScope } from "@/lib/data-bundles/team/hierarchy";
import { TEAM_INCOME_TYPES } from "@/lib/data-bundles/team/rules";

/**
 * A leader talking to their team, and the team answering back by doing things.
 *
 * Two halves. What a leader writes is stored, because a post nobody can find
 * again was not worth writing. What the team does is not: the feed is read
 * from the members, orders and ledger entries that already exist, so it cannot
 * drift from what really happened and costs nothing to keep.
 */

export interface TeamPost {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  createdAt: Date;
}

/** What this leader has written to their team. */
export async function getTeamPosts(leaderId: string, take = 20): Promise<TeamPost[]> {
  try {
    return await dataDb.dataTeamPost.findMany({
      where: { leaderId },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take,
      select: { id: true, title: true, body: true, isPinned: true, createdAt: true },
    });
  } catch {
    return [];
  }
}

/**
 * What a member should be reading: whatever their own recruiter has posted.
 *
 * Only the direct leader, not the whole upline. A second-level leader talking
 * past somebody's own recruiter is how two people end up coaching one agent in
 * different directions.
 */
export async function getPostsForMember(agentId: string, take = 10): Promise<TeamPost[]> {
  const me = await dataDb.dataAgent
    .findUnique({ where: { id: agentId }, select: { referredById: true } })
    .catch(() => null);
  if (!me?.referredById) return [];
  return getTeamPosts(me.referredById, take);
}

export interface TeamNote {
  id: string;
  body: string;
  createdAt: Date;
}

/** A leader's own notes on one member. Nobody else can read these. */
export async function getMemberNotes(
  leaderId: string,
  memberId: string,
  take = 20,
): Promise<TeamNote[]> {
  try {
    return await dataDb.dataTeamNote.findMany({
      where: { leaderId, memberId },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, body: true, createdAt: true },
    });
  } catch {
    return [];
  }
}

export interface ActivityItem {
  id: string;
  kind: "joined" | "sold" | "earned" | "recruited";
  at: Date;
  agentId: string | null;
  text: string;
  amount?: number;
}

/**
 * What the team has been doing lately.
 *
 * Derived rather than stored. Every line here is a member row, an order or a
 * ledger entry that exists anyway, so the feed cannot say something the
 * records do not — and a team that trades all day does not cost a write per
 * event to have a feed.
 */
export async function getTeamActivity(leaderId: string, take = 20): Promise<ActivityItem[]> {
  const scope = await getTeamScope(leaderId);
  if (scope.allIds.length === 0) return [];

  try {
    const [joined, orders, earned, names] = await Promise.all([
      dataDb.dataAgent.findMany({
        where: { id: { in: scope.allIds } },
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, storeName: true, createdAt: true, referredById: true },
      }),
      dataDb.dataOrder.findMany({
        where: {
          agentId: { in: scope.allIds },
          paymentStatus: "paid",
          status: { not: "refunded" },
        },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          agentId: true,
          price: true,
          sizeGb: true,
          network: true,
          createdAt: true,
        },
      }),
      dataDb.dataAgentLedger.findMany({
        where: {
          agentId: leaderId,
          sourceAgentId: { in: scope.allIds },
          type: { in: [...TEAM_INCOME_TYPES] },
        },
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, sourceAgentId: true, amount: true, createdAt: true },
      }),
      dataDb.dataAgent.findMany({
        where: { id: { in: scope.allIds } },
        select: { id: true, storeName: true },
      }),
    ]);

    const nameOf = new Map(names.map((n) => [n.id, n.storeName]));
    const items: ActivityItem[] = [
      ...joined.map((a) => ({
        id: `joined:${a.id}`,
        // A recruit of a recruit is the thing a leader most wants to notice:
        // it means somebody in the team has started building one.
        kind: (a.referredById === leaderId ? "joined" : "recruited") as ActivityItem["kind"],
        at: a.createdAt,
        agentId: a.id,
        text:
          a.referredById === leaderId
            ? `${a.storeName} joined your team`
            : `${nameOf.get(a.referredById ?? "") ?? "A member"} recruited ${a.storeName}`,
      })),
      ...orders.map((o) => ({
        id: `sold:${o.id}`,
        kind: "sold" as const,
        at: o.createdAt,
        agentId: o.agentId,
        text: `${nameOf.get(o.agentId ?? "") ?? "A member"} sold ${o.sizeGb}GB ${o.network}`,
        amount: round2(o.price),
      })),
      ...earned.map((e) => ({
        id: `earned:${e.id}`,
        kind: "earned" as const,
        at: e.createdAt,
        agentId: e.sourceAgentId,
        text: `${nameOf.get(e.sourceAgentId ?? "") ?? "A member"} earned you commission`,
        amount: round2(e.amount),
      })),
    ];

    return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
  } catch {
    return [];
  }
}
