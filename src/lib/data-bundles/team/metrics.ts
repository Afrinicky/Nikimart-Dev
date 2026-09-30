import "server-only";
import { dataDb } from "@/lib/data-db";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { getAgentUser } from "@/lib/data-bundles/user-link";
import { previousRange, type OverviewWindow } from "@/lib/data-bundles/overview-window";
import { getTeamScope, type MemberLevel, type TeamScope } from "@/lib/data-bundles/team/hierarchy";
import {
  growthPercent,
  isNewMember,
  memberActivity,
  TEAM_INCOME_TYPES,
  type MemberActivity,
} from "@/lib/data-bundles/team/rules";

/**
 * What a team is doing, counted from the records that already exist.
 *
 * Every figure here is read back rather than worked out. Sales come from the
 * orders the members sold; income to the leader comes from the leader's own
 * ledger, where each referral and team-sales credit already carries the agent
 * whose activity produced it. So "what has this member earned me" is a sum of
 * rows somebody was actually paid, not a rate applied to a total — and a change
 * to the commission rules can never make this screen disagree with the wallet.
 */

/** The `createdAt` filter for a window. An open start means all time. */
function within(w: OverviewWindow) {
  return { ...(w.start ? { gte: w.start } : {}), lt: w.end };
}

const PAID = { paymentStatus: "paid" as const, status: { not: "refunded" } };

export interface TeamTotals {
  members: number;
  directMembers: number;
  indirectMembers: number;
  activeMembers: number;
  /** The whole shape: selling, going quiet, gone, never started. */
  activity: { active: number; quiet: number; dormant: number; never: number };
  newMembers: number;
  /** Members who have recruited somebody of their own. */
  buildingMembers: number;
  sales: number;
  orders: number;
  customers: number;
  /** What the whole team has earned the leader, over the window. */
  income: number;
  /** Members a month ago, for the growth figure. */
  growth: number | null;
}

export interface TeamMemberRow {
  id: string;
  code: string;
  storeName: string;
  ownerName: string;
  level: MemberLevel;
  /** Who brought them in — the leader themselves, or one of their recruits. */
  recruitedById: string | null;
  status: string;
  activity: MemberActivity;
  joinedAt: Date;
  registrationPaid: boolean;
  sales: number;
  orders: number;
  customers: number;
  /** How many people this member has recruited themselves. */
  teamSize: number;
  /** What this member has earned the leader, over the window. */
  income: number;
  lastSoldAt: Date | null;
}

export interface TeamView {
  scope: TeamScope;
  totals: TeamTotals;
  rows: TeamMemberRow[];
}

/**
 * One team, over one window.
 *
 * Built as a handful of grouped queries over the whole team rather than a
 * query per member: a leader with thirty recruits should cost the same number
 * of round trips as one with three.
 */
export async function getTeamView(leaderId: string, w: OverviewWindow): Promise<TeamView> {
  const scope = await getTeamScope(leaderId);
  const empty: TeamView = {
    scope,
    totals: {
      members: 0,
      directMembers: scope.directIds.length,
      indirectMembers: scope.indirectIds.length,
      activeMembers: 0,
      activity: { active: 0, quiet: 0, dormant: 0, never: 0 },
      newMembers: 0,
      buildingMembers: 0,
      sales: 0,
      orders: 0,
      customers: 0,
      income: 0,
      growth: null,
    },
    rows: [],
  };
  if (scope.allIds.length === 0) return empty;

  const level = new Map<string, MemberLevel>([
    ...scope.directIds.map((id) => [id, 1] as const),
    ...scope.indirectIds.map((id) => [id, 2] as const),
  ]);

  try {
    const [agents, sales, buyers, lastSales, income, recruits, customerRows] = await Promise.all([
      dataDb.dataAgent.findMany({
        where: { id: { in: scope.allIds } },
        select: {
          id: true,
          code: true,
          storeName: true,
          status: true,
          userId: true,
          referredById: true,
          createdAt: true,
          setupFeePaidAt: true,
        },
      }),
      // What each member sold in the window.
      dataDb.dataOrder.groupBy({
        by: ["agentId"],
        where: { agentId: { in: scope.allIds }, ...PAID, createdAt: within(w) },
        _sum: { price: true },
        _count: { _all: true },
      }),
      // Distinct buyers per member. There is no customer record on the bundle
      // side, so a customer is a phone number that has bought from them.
      dataDb.dataOrder.groupBy({
        by: ["agentId", "buyerPhone"],
        where: { agentId: { in: scope.allIds }, ...PAID, createdAt: within(w) },
      }),
      // When each member last sold anything at all — the activity state is
      // about the member, not about the window being looked at.
      dataDb.dataOrder.groupBy({
        by: ["agentId"],
        where: { agentId: { in: scope.allIds }, ...PAID },
        _max: { createdAt: true },
      }),
      // What the leader was actually paid, by the member who produced it.
      dataDb.dataAgentLedger.groupBy({
        by: ["sourceAgentId"],
        where: {
          agentId: leaderId,
          sourceAgentId: { in: scope.allIds },
          type: { in: [...TEAM_INCOME_TYPES] },
          createdAt: within(w),
        },
        _sum: { amount: true },
      }),
      // Who is building a team of their own.
      dataDb.dataAgent.groupBy({
        by: ["referredById"],
        where: { referredById: { in: scope.allIds } },
        _count: { _all: true },
      }),
      // The team's customers, counted once across the whole team rather than
      // summed per member — one buyer served by two agents is one customer.
      dataDb.dataOrder.groupBy({
        by: ["buyerPhone"],
        where: { agentId: { in: scope.allIds }, ...PAID, createdAt: within(w) },
      }),
    ]);

    const salesBy = new Map(sales.map((s) => [s.agentId, s]));
    const lastBy = new Map(lastSales.map((s) => [s.agentId, s._max.createdAt]));
    const incomeBy = new Map(income.map((i) => [i.sourceAgentId, round2(i._sum.amount ?? 0)]));
    const recruitsBy = new Map(recruits.map((r) => [r.referredById, r._count._all]));
    const buyersBy = new Map<string, number>();
    for (const b of buyers) {
      if (!b.agentId) continue;
      buyersBy.set(b.agentId, (buyersBy.get(b.agentId) ?? 0) + 1);
    }

    const now = new Date();
    const rows: TeamMemberRow[] = await Promise.all(
      agents.map(async (a) => {
        const user = await getAgentUser(a.userId);
        const s = salesBy.get(a.id);
        const lastSoldAt = lastBy.get(a.id) ?? null;
        return {
          id: a.id,
          code: a.code,
          storeName: a.storeName,
          ownerName: user?.name ?? "",
          level: level.get(a.id) ?? 1,
          recruitedById: a.referredById,
          status: a.status,
          activity: memberActivity(lastSoldAt, now),
          joinedAt: a.createdAt,
          registrationPaid: Boolean(a.setupFeePaidAt),
          sales: round2(s?._sum.price ?? 0),
          orders: s?._count._all ?? 0,
          customers: buyersBy.get(a.id) ?? 0,
          teamSize: recruitsBy.get(a.id) ?? 0,
          income: incomeBy.get(a.id) ?? 0,
          lastSoldAt,
        };
      }),
    );

    rows.sort((a, b) => b.sales - a.sales || b.income - a.income);

    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
    const before = rows.filter((r) => r.joinedAt < monthAgo).length;

    return {
      scope,
      rows,
      totals: {
        members: rows.length,
        directMembers: scope.directIds.length,
        indirectMembers: scope.indirectIds.length,
        activeMembers: rows.filter((r) => r.activity === "active").length,
        activity: {
          active: rows.filter((r) => r.activity === "active").length,
          quiet: rows.filter((r) => r.activity === "quiet").length,
          dormant: rows.filter((r) => r.activity === "dormant").length,
          never: rows.filter((r) => r.activity === "never").length,
        },
        newMembers: rows.filter((r) => isNewMember(r.joinedAt, now)).length,
        buildingMembers: rows.filter((r) => r.teamSize > 0).length,
        sales: round2(rows.reduce((sum, r) => sum + r.sales, 0)),
        orders: rows.reduce((sum, r) => sum + r.orders, 0),
        customers: customerRows.length,
        income: round2(rows.reduce((sum, r) => sum + r.income, 0)),
        growth: growthPercent(rows.length, before),
      },
    };
  } catch {
    return empty;
  }
}

/**
 * One agent's team, as totals only, over a window.
 *
 * getTeamView above answers the same questions and more, but it builds a row
 * per member and looks the owner up for each — which is the right shape for
 * the team screen and far too much work for four tiles on somebody else's
 * dashboard. This is the same scope, the same window and the same
 * TEAM_INCOME_TYPES, read as three grouped sums, so the two can report
 * different levels of detail but never a different answer.
 *
 * "Joined" counts direct recruits only: an agent recruits the people they
 * signed up, not the people those people went on to sign up.
 */
export interface AgentTeamTotals {
  /** Everybody under them right now, direct and indirect. */
  members: number;
  directMembers: number;
  /** Direct recruits who joined inside the window. */
  joined: number;
  /** What the whole team sold in the window. */
  sales: number;
  orders: number;
  /** What the team earned this agent in the window. */
  income: number;
  previous: { joined: number; sales: number; income: number } | null;
}

export async function getAgentTeamTotals(
  leaderId: string,
  w: OverviewWindow,
): Promise<AgentTeamTotals> {
  const scope = await getTeamScope(leaderId);
  const earlier = previousRange(w);
  const empty: AgentTeamTotals = {
    members: scope.allIds.length,
    directMembers: scope.directIds.length,
    joined: 0,
    sales: 0,
    orders: 0,
    income: 0,
    previous: null,
  };
  if (scope.allIds.length === 0) return empty;

  try {
    const [joined, sales, income, joinedBefore, salesBefore, incomeBefore] = await Promise.all([
      dataDb.dataAgent.count({
        where: { referredById: leaderId, createdAt: within(w) },
      }),
      dataDb.dataOrder.aggregate({
        where: { agentId: { in: scope.allIds }, ...PAID, createdAt: within(w) },
        _sum: { price: true },
        _count: { _all: true },
      }),
      dataDb.dataAgentLedger.aggregate({
        where: {
          agentId: leaderId,
          sourceAgentId: { in: scope.allIds },
          type: { in: [...TEAM_INCOME_TYPES] },
          createdAt: within(w),
        },
        _sum: { amount: true },
      }),
      earlier
        ? dataDb.dataAgent.count({ where: { referredById: leaderId, createdAt: earlier } })
        : Promise.resolve(null),
      earlier
        ? dataDb.dataOrder.aggregate({
            where: { agentId: { in: scope.allIds }, ...PAID, createdAt: earlier },
            _sum: { price: true },
          })
        : Promise.resolve(null),
      earlier
        ? dataDb.dataAgentLedger.aggregate({
            where: {
              agentId: leaderId,
              sourceAgentId: { in: scope.allIds },
              type: { in: [...TEAM_INCOME_TYPES] },
              createdAt: earlier,
            },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      members: scope.allIds.length,
      directMembers: scope.directIds.length,
      joined,
      sales: round2(sales._sum.price ?? 0),
      orders: sales._count._all,
      income: round2(income._sum.amount ?? 0),
      previous: earlier
        ? {
            joined: joinedBefore ?? 0,
            sales: round2(salesBefore?._sum.price ?? 0),
            income: round2(incomeBefore?._sum.amount ?? 0),
          }
        : null,
    };
  } catch {
    return empty;
  }
}

export interface IncomeEntry {
  id: string;
  type: string;
  amount: number;
  narration: string;
  createdAt: Date;
  sourceAgentId: string | null;
}

/**
 * The individual credits behind an income figure.
 *
 * A total a leader cannot break down is a total they have to take on trust,
 * and this is their money. Reads the leader's own ledger, so every line here
 * is one they were really paid.
 */
export async function getTeamIncomeEntries(
  leaderId: string,
  w: OverviewWindow,
  opts: { memberId?: string; take?: number } = {},
): Promise<IncomeEntry[]> {
  try {
    return await dataDb.dataAgentLedger.findMany({
      where: {
        agentId: leaderId,
        type: { in: [...TEAM_INCOME_TYPES] },
        createdAt: within(w),
        ...(opts.memberId ? { sourceAgentId: opts.memberId } : { sourceAgentId: { not: null } }),
      },
      orderBy: { createdAt: "desc" },
      take: opts.take ?? 50,
      select: {
        id: true,
        type: true,
        amount: true,
        narration: true,
        createdAt: true,
        sourceAgentId: true,
      },
    });
  } catch {
    return [];
  }
}

export interface MemberProfile {
  id: string;
  code: string;
  storeName: string;
  slug: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  supportPhone: string;
  level: MemberLevel;
  /** Who brought them in — the leader themselves, or one of their recruits. */
  recruitedById: string | null;
  status: string;
  activity: MemberActivity;
  joinedAt: Date;
  registrationPaid: boolean;
  lastSoldAt: Date | null;
  /** Over the window being looked at. */
  sales: number;
  orders: number;
  customers: number;
  income: number;
  /** Since they joined, whatever window is selected. */
  lifetimeSales: number;
  lifetimeOrders: number;
  lifetimeIncome: number;
  /** Who they have recruited themselves. */
  recruits: { id: string; code: string; storeName: string; joinedAt: Date; status: string }[];
  /** Their last few orders, as the leader's view of what they are doing. */
  recentOrders: {
    id: string;
    reference: string;
    network: string;
    sizeGb: number;
    price: number;
    status: string;
    createdAt: Date;
  }[];
}

/**
 * One member, as their leader sees them.
 *
 * Both a window and a lifetime, because the two answer different questions: a
 * quiet month is not the same as a bad agent, and a leader deciding who to
 * call needs to see both at once.
 *
 * The caller is responsible for proving the leader may look — `memberLevelFor`
 * is that check, and its answer is passed in rather than re-derived here.
 */
export async function getMemberProfile(
  leaderId: string,
  memberId: string,
  level: MemberLevel,
  w: OverviewWindow,
): Promise<MemberProfile | null> {
  const agent = await dataDb.dataAgent
    .findUnique({
      where: { id: memberId },
      select: {
        id: true,
        code: true,
        storeName: true,
        slug: true,
        status: true,
        userId: true,
        supportPhone: true,
        referredById: true,
        createdAt: true,
        setupFeePaidAt: true,
      },
    })
    .catch(() => null);
  if (!agent) return null;

  const incomeWhere = {
    agentId: leaderId,
    sourceAgentId: memberId,
    type: { in: [...TEAM_INCOME_TYPES] },
  };

  const [user, windowSales, lifetime, buyers, lastSale, windowIncome, lifeIncome, recruits, orders] =
    await Promise.all([
      getAgentUser(agent.userId),
      dataDb.dataOrder
        .aggregate({
          where: { agentId: memberId, ...PAID, createdAt: within(w) },
          _sum: { price: true },
          _count: { _all: true },
        })
        .catch(() => null),
      dataDb.dataOrder
        .aggregate({
          where: { agentId: memberId, ...PAID },
          _sum: { price: true },
          _count: { _all: true },
        })
        .catch(() => null),
      dataDb.dataOrder
        .groupBy({
          by: ["buyerPhone"],
          where: { agentId: memberId, ...PAID, createdAt: within(w) },
        })
        .catch((): { buyerPhone: string }[] => []),
      dataDb.dataOrder
        .aggregate({ where: { agentId: memberId, ...PAID }, _max: { createdAt: true } })
        .catch(() => null),
      dataDb.dataAgentLedger
        .aggregate({ where: { ...incomeWhere, createdAt: within(w) }, _sum: { amount: true } })
        .catch(() => null),
      dataDb.dataAgentLedger
        .aggregate({ where: incomeWhere, _sum: { amount: true } })
        .catch(() => null),
      dataDb.dataAgent
        .findMany({
          where: { referredById: memberId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, code: true, storeName: true, createdAt: true, status: true },
        })
        .catch(
          (): { id: string; code: string; storeName: string; createdAt: Date; status: string }[] =>
            [],
        ),
      dataDb.dataOrder
        .findMany({
          where: { agentId: memberId, paymentStatus: "paid" },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            reference: true,
            network: true,
            sizeGb: true,
            price: true,
            status: true,
            createdAt: true,
          },
        })
        .catch((): MemberProfile["recentOrders"] => []),
    ]);

  const lastSoldAt = lastSale?._max.createdAt ?? null;
  return {
    id: agent.id,
    code: agent.code,
    storeName: agent.storeName,
    slug: agent.slug,
    ownerName: user?.name ?? "",
    ownerPhone: user?.phone ?? "",
    ownerEmail: user?.email ?? "",
    supportPhone: agent.supportPhone ?? "",
    level,
    recruitedById: agent.referredById,
    status: agent.status,
    activity: memberActivity(lastSoldAt),
    joinedAt: agent.createdAt,
    registrationPaid: Boolean(agent.setupFeePaidAt),
    lastSoldAt,
    sales: round2(windowSales?._sum.price ?? 0),
    orders: windowSales?._count._all ?? 0,
    customers: buyers.length,
    income: round2(windowIncome?._sum.amount ?? 0),
    lifetimeSales: round2(lifetime?._sum.price ?? 0),
    lifetimeOrders: lifetime?._count._all ?? 0,
    lifetimeIncome: round2(lifeIncome?._sum.amount ?? 0),
    recruits: recruits.map(({ createdAt, ...r }) => ({ ...r, joinedAt: createdAt })),
    recentOrders: orders,
  };
}
