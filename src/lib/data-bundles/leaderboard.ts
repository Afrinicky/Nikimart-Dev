import "server-only";
import { unstable_cache } from "next/cache";
import { dataDb } from "@/lib/data-db";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { getLeaderboardConfig, type LeaderboardConfig } from "@/lib/data-bundles/settings";
import {
  performanceEligible,
  performanceGrade,
  periodRange,
  rankStandings,
  windowStart,
  type BoardKey,
  type PerformanceGrade,
  type RankedStanding,
  type Standing,
} from "@/lib/data-bundles/leaderboard-rules";

/**
 * The leaderboards, counted from the business rather than stored beside it.
 *
 * Nothing here holds a standing. Top Sales, Top Recruiters and Current
 * Performance are all counted out of the orders and referrals that already
 * exist, every time a board is drawn, so a place can never drift from the
 * sales behind it and a refunded order simply stops counting. The only thing
 * the database keeps is what counting cannot reproduce — the points a closed
 * period paid, which live in the points ledger.
 *
 * Only successful business counts. A sale is an order that was paid for and
 * actually delivered; a referral is a recruit whose registration was settled.
 * Anything pending, failed or refunded is on nobody's board.
 *
 * The count is the score and the cedis are the tie-break, in that order, for
 * every board. It is the figure an agent can move today by selling one more
 * bundle, which is what a leaderboard is for.
 */

/** One agent's place on one board. */
export interface BoardRow {
  agentId: string;
  rank: number;
  code: string;
  storeName: string;
  /** What the board counts: sales, recruits, or sales in the window. */
  score: number;
  /** The cedis behind that count. */
  value: number;
  /** True for the agent looking at it. */
  isYou: boolean;
  /** Only on the performance board, and only when it is good enough to say. */
  grade?: PerformanceGrade;
}

export interface Board {
  key: BoardKey;
  title: string;
  /** What one point of the score is: "sales", "recruits". */
  unit: string;
  /** The board itself, capped at the configured size. */
  rows: BoardRow[];
  /** The viewer's own row, wherever on the board it falls. */
  you: BoardRow | null;
  /** Everybody on the board, not just the rows above. */
  total: number;
  /** The period this board covers, in words. */
  periodLabel: string;
  /** Said when the viewer isn't on the board and there's a reason for it. */
  note: string | null;
}

interface AgentRef {
  id: string;
  code: string;
  storeName: string;
  createdAt: Date;
}

/** Every agent who is allowed on a board: trading, not suspended. */
async function boardAgents(): Promise<Map<string, AgentRef>> {
  const rows = await dataDb.dataAgent
    .findMany({
      where: { status: "active" },
      select: { id: true, code: true, storeName: true, createdAt: true },
      // A ceiling so one board can never read an unbounded table. Far above
      // the roster any of this is likely to see.
      take: 5000,
    })
    .catch((): AgentRef[] => []);
  return new Map(rows.map((r) => [r.id, r]));
}

/** Successful sales — paid for and delivered — grouped by the agent who sold. */
async function salesStandings(from: Date | null, to: Date | null): Promise<Standing[]> {
  const rows = await dataDb.dataOrder
    .groupBy({
      by: ["agentId"],
      where: {
        agentId: { not: null },
        status: "completed",
        paymentStatus: "paid",
        ...(from || to
          ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
          : {}),
      },
      _count: { _all: true },
      _sum: { price: true },
    })
    .catch(
      (): Array<{ agentId: string | null; _count: { _all: number }; _sum: { price: number | null } }> =>
        [],
    );

  return rows.flatMap((r) =>
    r.agentId
      ? [{ agentId: r.agentId, score: r._count._all, value: round2(r._sum.price ?? 0) }]
      : [],
  );
}

/**
 * Successful referrals, grouped by the recruiter.
 *
 * "Successful" is a recruit whose registration was actually settled — paid up
 * front, cleared out of commission, or waived by the admin. A name in the
 * queue that never paid is not a recruit anybody should be ranked for; it is
 * the same rule the joining reward follows.
 */
async function recruitStandings(from: Date | null, to: Date | null): Promise<Standing[]> {
  const rows = await dataDb.dataAgent
    .groupBy({
      by: ["referredById"],
      where: {
        referredById: { not: null },
        OR: [{ setupFeePaidAt: { not: null } }, { setupFeeMethod: "WAIVED" }],
        ...(from || to
          ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
          : {}),
      },
      _count: { _all: true },
    })
    .catch((): Array<{ referredById: string | null; _count: { _all: number } }> => []);

  return rows.flatMap((r) =>
    r.referredById ? [{ agentId: r.referredById, score: r._count._all, value: 0 }] : [],
  );
}

/** Everything the three boards need, computed once. */
interface Standings {
  sales: RankedStanding[];
  recruits: RankedStanding[];
  performance: RankedStanding[];
  /** Sales in the performance window, by agent, for grading and eligibility. */
  windowSales: Record<string, number>;
  agents: Array<[string, AgentRef]>;
  periodLabel: string;
  windowLabel: string;
}

/**
 * Count all three boards for one period.
 *
 * Uncached on purpose — the cached wrapper below is for the live boards, while
 * the award sweep needs a closed period counted exactly as it stands right
 * now, with nothing served from before the period ended.
 */
async function computeStandings(
  config: LeaderboardConfig,
  now: Date,
  offset: number,
): Promise<Standings> {
  const range = periodRange(config.period, now, offset);
  // The performance window is a rolling number of days, not the ranking
  // period — that is what makes it "current" rather than "this month so far".
  // For a closed period it is the days leading up to that period's end, so an
  // award made a week late is still the performance that earned it.
  const windowEnd = range.end && range.end < now ? range.end : now;
  const from = windowStart(windowEnd, config.windowDays);

  const [agents, sales, recruits, windowRows] = await Promise.all([
    boardAgents(),
    salesStandings(range.start, range.end),
    recruitStandings(range.start, range.end),
    salesStandings(from, windowEnd),
  ]);

  const known = (rows: Standing[]) => rows.filter((r) => agents.has(r.agentId));

  const windowSales: Record<string, number> = {};
  for (const row of windowRows) windowSales[row.agentId] = row.score;

  const eligible = known(windowRows).filter((row) => {
    const agent = agents.get(row.agentId);
    if (!agent) return false;
    return performanceEligible(
      { joinedAt: agent.createdAt, salesInWindow: row.score },
      config,
      windowEnd,
    );
  });

  return {
    sales: rankStandings(known(sales)),
    recruits: rankStandings(known(recruits)),
    performance: rankStandings(eligible),
    windowSales,
    agents: [...agents.entries()],
    periodLabel: range.label,
    windowLabel: `Last ${config.windowDays} days`,
  };
}

/**
 * The live boards, cached for a minute.
 *
 * A leaderboard is worth refreshing often and worth counting rarely: every
 * agent dashboard draws it, and three grouped counts per page view would be
 * three per agent per refresh. A minute is close enough to live that an agent
 * watching their own sale land sees it, and cheap enough that the boards cost
 * one count a minute however many people are looking.
 */
const readLiveStandings = unstable_cache(
  // The config travels as an argument rather than being read inside, so it is
  // part of the cache key: change what the boards measure and the next reader
  // counts again instead of being served the old shape.
  async (config: LeaderboardConfig): Promise<Standings> =>
    computeStandings(config, new Date(), 0),
  ["data-leaderboard"],
  { tags: ["data-leaderboard"], revalidate: 60 },
);

/** Cache tag for the live boards. Awards drop it so new points show at once. */
export const LEADERBOARD_TAG = "data-leaderboard";

function toRows(
  standings: RankedStanding[],
  agents: Map<string, AgentRef>,
  viewerId: string | null,
  grades?: (agentId: string) => PerformanceGrade,
): BoardRow[] {
  return standings.flatMap((row) => {
    const agent = agents.get(row.agentId);
    if (!agent) return [];
    return [
      {
        agentId: row.agentId,
        rank: row.rank,
        code: agent.code,
        storeName: agent.storeName,
        score: row.score,
        value: row.value,
        isYou: row.agentId === viewerId,
        ...(grades ? { grade: grades(row.agentId) } : {}),
      },
    ];
  });
}

export interface LeaderboardView {
  enabled: boolean;
  boards: Board[];
  config: LeaderboardConfig;
}

/**
 * Everything a leaderboard screen draws, for one viewer.
 *
 * The viewer's own row is carried separately from the visible rows, because an
 * agent in 40th place still has to be able to see where they are — a board
 * that shows them only the people they will never catch is a board they stop
 * opening.
 */
export async function getLeaderboardView(viewerAgentId: string | null): Promise<LeaderboardView> {
  const config = await getLeaderboardConfig();
  if (!config.enabled) return { enabled: false, boards: [], config };

  const standings = await readLiveStandings(config).catch(() => null);
  if (!standings) return { enabled: true, boards: [], config };

  const agents = new Map(standings.agents);
  const boards: Board[] = [];

  const build = (
    key: BoardKey,
    title: string,
    unit: string,
    ranked: RankedStanding[],
    periodLabel: string,
    note: string | null,
    grades?: (agentId: string) => PerformanceGrade,
  ): Board => {
    const rows = toRows(ranked, agents, viewerAgentId, grades);
    const you = rows.find((r) => r.isYou) ?? null;
    return {
      key,
      title,
      unit,
      rows: rows.slice(0, config.size),
      you,
      total: rows.length,
      periodLabel,
      note: you ? null : note,
    };
  };

  if (config.salesEnabled) {
    boards.push(
      build(
        "SALES",
        "Top Sales",
        "sales",
        standings.sales,
        standings.periodLabel,
        "Sell a bundle and you are on the board.",
      ),
    );
  }
  if (config.recruitsEnabled) {
    boards.push(
      build(
        "RECRUITS",
        "Top Recruiters",
        "recruits",
        standings.recruits,
        standings.periodLabel,
        "Share your agent code. A recruit counts once their registration is settled.",
      ),
    );
  }
  if (config.performanceEnabled) {
    boards.push(
      build(
        "PERFORMANCE",
        "Current Performance",
        "sales",
        standings.performance,
        standings.windowLabel,
        `Open to agents ${config.minAgentAgeDays} days old with ${config.minQualifyingSales} sales in the last ${config.windowDays} days.`,
        (agentId) => performanceGrade(standings.windowSales[agentId] ?? 0, config),
      ),
    );
  }

  return { enabled: true, boards, config };
}

/** The standings for a period that has closed, for the points award. */
export async function closedPeriodStandings(
  config: LeaderboardConfig,
  now = new Date(),
): Promise<{ standings: Standings; periodKey: string } | null> {
  // A period that never ends never closes, so there is nothing to pay for.
  if (config.period === "ALL") return null;
  const range = periodRange(config.period, now, 1);
  const standings = await computeStandings(config, now, 1).catch(() => null);
  if (!standings) return null;
  return { standings, periodKey: range.key };
}
