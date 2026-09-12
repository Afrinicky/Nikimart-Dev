import "server-only";
import { dataDb } from "@/lib/data-db";
import { getLeaderboardConfig } from "@/lib/data-bundles/settings";
import { closedPeriodStandings } from "@/lib/data-bundles/leaderboard";
import {
  performanceGrade,
  pointsForGrade,
  pointsForRank,
  type BoardKey,
  type RankedStanding,
} from "@/lib/data-bundles/leaderboard-rules";

/**
 * Points: the only place an agent's `pointsBalance` is allowed to move.
 *
 * The same shape the cedi ledger takes, for the same reason — every change
 * writes a row and updates the balance together, so the two can never
 * disagree and an agent can always be shown where each point came from.
 *
 * Points are not money. They are earned by placing on a board when a ranking
 * period closes, and spent on whatever rewards the admin has put on the shelf.
 * Nothing here converts one into the other; that happens when an admin
 * fulfils a cash reward, and it goes through the cedi ledger like any other
 * credit.
 */

export type PointType =
  | "RANK_SALES"
  | "RANK_RECRUITS"
  | "RANK_PERFORMANCE"
  | "PERFORMANCE_BONUS"
  | "REDEMPTION"
  | "REFUND"
  | "ADJUSTMENT";

/** The slice of the data client a points write needs — a transaction fits. */
export type PointsClient = Pick<typeof dataDb, "dataAgent" | "dataAgentPoint">;

export interface PointEntry {
  agentId: string;
  type: PointType;
  /** Signed: positive earns, negative spends. */
  points: number;
  narration: string;
  periodKey?: string | null;
  rank?: number | null;
  /**
   * A key unique to the thing being paid for, e.g.
   * "RANK:SALES:2026-09:<agentId>". The database refuses a second row with the
   * same key, so a sweep that runs twice pays once.
   */
  dedupeKey?: string | null;
  /**
   * Spend these points only while the agent still has at least this many.
   *
   * Checking a balance and then debiting it is two steps, and two redemptions
   * submitted together can both pass the check before either writes. Set this
   * and the balance is tested and decremented in one conditional UPDATE, so
   * the second one finds the points gone.
   */
  requirePoints?: number;
}

/** Thrown when `requirePoints` is no longer satisfied. */
export class InsufficientPointsError extends Error {
  constructor() {
    super("INSUFFICIENT_POINTS");
    this.name = "InsufficientPointsError";
  }
}

/** Thrown when an entry carrying a `dedupeKey` has already been written. */
export class DuplicatePointEntryError extends Error {
  constructor() {
    super("DUPLICATE_POINT_ENTRY");
    this.name = "DuplicatePointEntryError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/** Apply one points entry. Returns the balance afterwards. */
export async function postPointEntry(
  entry: PointEntry,
  tx: PointsClient = dataDb,
): Promise<number | null> {
  const points = Math.round(entry.points);
  if (!Number.isFinite(points) || points === 0) return null;

  // Checked before the balance moves. The unique index below is the real
  // guarantee; this is what stops a duplicate crediting the balance and then
  // failing on the row, which would leave the two out of step.
  if (entry.dedupeKey) {
    const seen = await tx.dataAgentPoint.findUnique({
      where: { dedupeKey: entry.dedupeKey },
      select: { id: true },
    });
    if (seen) throw new DuplicatePointEntryError();
  }

  if (entry.requirePoints !== undefined) {
    const claimed = await tx.dataAgent.updateMany({
      where: { id: entry.agentId, pointsBalance: { gte: entry.requirePoints } },
      data: { pointsBalance: { increment: points } },
    });
    if (claimed.count === 0) throw new InsufficientPointsError();
  }

  const agent =
    entry.requirePoints !== undefined
      ? await tx.dataAgent.findUniqueOrThrow({
          where: { id: entry.agentId },
          select: { pointsBalance: true },
        })
      : await tx.dataAgent.update({
          where: { id: entry.agentId },
          data: { pointsBalance: { increment: points } },
          select: { pointsBalance: true },
        });

  const balanceAfter = agent.pointsBalance;
  try {
    await tx.dataAgentPoint.create({
      data: {
        agentId: entry.agentId,
        type: entry.type,
        points,
        balanceAfter,
        narration: entry.narration.slice(0, 300),
        periodKey: entry.periodKey ?? null,
        rank: entry.rank ?? null,
        dedupeKey: entry.dedupeKey ?? null,
      },
    });
  } catch (err) {
    if (entry.dedupeKey && isUniqueViolation(err)) {
      // Two callers raced and the index caught the loser. Put the points back
      // — the winner has already awarded them.
      await tx.dataAgent
        .update({ where: { id: entry.agentId }, data: { pointsBalance: { decrement: points } } })
        .catch(() => {});
      throw new DuplicatePointEntryError();
    }
    throw err;
  }
  return balanceAfter;
}

/** An agent's points history, newest first. */
export async function getPointsHistory(agentId: string, take = 20) {
  try {
    return await dataDb.dataAgentPoint.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take,
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Awarding a closed period
// ---------------------------------------------------------------------------

const RANK_TYPE: Record<BoardKey, PointType> = {
  SALES: "RANK_SALES",
  RECRUITS: "RANK_RECRUITS",
  PERFORMANCE: "RANK_PERFORMANCE",
};

const RANK_LABEL: Record<BoardKey, string> = {
  SALES: "Top Sales",
  RECRUITS: "Top Recruiters",
  PERFORMANCE: "Current Performance",
};

const PLACE = ["1st", "2nd", "3rd"];

async function award(entry: PointEntry): Promise<boolean> {
  try {
    await postPointEntry(entry);
    return true;
  } catch (err) {
    // Already awarded — which is the normal case every time the sweep runs
    // again on a period it has already paid for.
    if (err instanceof DuplicatePointEntryError) return false;
    return false;
  }
}

/**
 * Pay out the ranking period that has just closed — once, however often this
 * runs.
 *
 * Only the period that has closed pays, and only the most recent one. A
 * period still running has no winner, and paying a provisional one would mean
 * either taking points back or paying twice.
 *
 * Called from the data-bundle sweep rather than on a schedule of its own, so
 * the award does not depend on anything firing at midnight on the first: any
 * sweep during the following period pays it. Every award carries a dedupe key
 * built from the board, the period and the agent, so the second and hundredth
 * attempt write nothing.
 */
export async function awardLeaderboardPoints(now = new Date()): Promise<number> {
  const config = await getLeaderboardConfig();
  if (!config.enabled) return 0;

  const closed = await closedPeriodStandings(config, now);
  if (!closed) return 0;
  const { standings, periodKey } = closed;

  const boards: Array<{ key: BoardKey; rows: RankedStanding[]; enabled: boolean }> = [
    { key: "SALES", rows: standings.sales, enabled: config.salesEnabled },
    { key: "RECRUITS", rows: standings.recruits, enabled: config.recruitsEnabled },
    { key: "PERFORMANCE", rows: standings.performance, enabled: config.performanceEnabled },
  ];

  let paid = 0;

  for (const board of boards) {
    if (!board.enabled) continue;
    for (const row of board.rows) {
      // Sorted by rank, so the first row past third ends the board.
      if (row.rank > 3) break;
      const points = pointsForRank(row.rank, config.points);
      if (points <= 0) continue;
      const won = await award({
        agentId: row.agentId,
        type: RANK_TYPE[board.key],
        points,
        rank: row.rank,
        periodKey,
        narration: `${PLACE[row.rank - 1]} on ${RANK_LABEL[board.key]} — ${periodKey}`,
        dedupeKey: `RANK:${board.key}:${periodKey}:${row.agentId}`,
      });
      if (won) paid++;
    }
  }

  // Current Performance pays for the figure as well as the place: an agent can
  // have an exceptional month and still be fourth, and that is exactly the
  // agent this board was added for.
  if (config.performanceEnabled) {
    for (const row of standings.performance) {
      const grade = performanceGrade(standings.windowSales[row.agentId] ?? 0, config);
      const points = pointsForGrade(grade, config);
      if (points <= 0) continue;
      const won = await award({
        agentId: row.agentId,
        type: "PERFORMANCE_BONUS",
        points,
        periodKey,
        narration: `${grade === "EXCEPTIONAL" ? "Exceptional" : "Excellent"} performance — ${periodKey}`,
        dedupeKey: `PERFORMANCE:${periodKey}:${row.agentId}`,
      });
      if (won) paid++;
    }
  }

  return paid;
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

/** The rewards on the shelf. `all` includes the ones an admin has retired. */
export async function getRewardTiers(all = false) {
  try {
    return await dataDb.dataRewardTier.findMany({
      where: all ? {} : { isActive: true },
      orderBy: [{ order: "asc" }, { points: "asc" }],
    });
  } catch {
    return [];
  }
}

/** One agent's redemptions, newest first. */
export async function getAgentRedemptions(agentId: string, take = 10) {
  try {
    return await dataDb.dataRewardRedemption.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take,
    });
  } catch {
    return [];
  }
}

/** The admin's redemption queue. */
export async function listRedemptions(status = "pending", take = 50) {
  try {
    return await dataDb.dataRewardRedemption.findMany({
      where: status === "all" ? {} : { status },
      orderBy: { createdAt: "desc" },
      take,
    });
  } catch {
    return [];
  }
}
