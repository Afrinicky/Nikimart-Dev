// Relative, with the extension: this module is pulled in by a *.test.ts run
// through Node's type stripping, which resolves neither the "@/…" alias nor a
// missing extension. Safe because nothing here is ever emitted — the same
// reason allowImportingTsExtensions is on in tsconfig.

/**
 * The rules of the leaderboard, as a pure module.
 *
 * Kept out of leaderboard.ts — which is server-only, because it counts orders
 * out of the database — so the parts that decide who is where, who is eligible
 * and what a place is worth can be tested without one.
 *
 * The whole feature is four small decisions, and each of them is somewhere an
 * agent will notice the moment it is wrong: where a period starts and ends,
 * how a tie is broken, whether a newer agent is allowed onto the performance
 * board yet, and how many points a place pays.
 */

/** The window the boards rank over. ALL is lifetime and never closes. */
export type LeaderboardPeriod = "WEEK" | "MONTH" | "ALL";

/** The three boards. */
export type BoardKey = "SALES" | "RECRUITS" | "PERFORMANCE";

/** One period: the key it is filed under, and the dates it covers. */
export interface PeriodRange {
  /** "2026-09", "2026-W37", or "all" — what a points award is filed under. */
  key: string;
  /** Inclusive. Null on ALL, which has no beginning. */
  start: Date | null;
  /** Exclusive. Null on ALL, which has no end. */
  end: Date | null;
  /** How to say it on screen: "September 2026", "week of 7 Sep". */
  label: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Midnight UTC on the day `date` falls in. */
function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * The Monday that begins the week `date` falls in.
 *
 * Monday rather than Sunday because that is the week a Ghanaian trading week
 * runs on, and because a board that resets mid-weekend rewards whoever
 * happened to be awake.
 */
function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  // getUTCDay is 0 for Sunday, so Sunday is six days into its week, not zero.
  const offset = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offset * 86_400_000);
}

/** ISO-8601 week number, which is what makes "2026-W37" mean one week. */
function isoWeek(monday: Date): { year: number; week: number } {
  // The Thursday of this week decides which year the week belongs to — the
  // rule that stops the last days of December and the first of January
  // landing in two different "week 1"s.
  const thursday = new Date(monday.getTime() + 3 * 86_400_000);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstMonday = startOfWeek(firstThursday);
  const week = Math.round((thursday.getTime() - firstMonday.getTime()) / (7 * 86_400_000)) + 1;
  return { year: thursday.getUTCFullYear(), week };
}

function shortDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}`;
}

/**
 * The period `offset` steps back from the one containing `now`.
 *
 * `offset: 0` is the period running right now — what the live board ranks.
 * `offset: 1` is the one before it, which is the only one that can be paid
 * for: a period still running has no winner yet.
 */
export function periodRange(period: LeaderboardPeriod, now: Date, offset = 0): PeriodRange {
  if (period === "ALL") {
    return { key: "all", start: null, end: null, label: "All time" };
  }

  if (period === "WEEK") {
    const start = new Date(startOfWeek(now).getTime() - offset * 7 * 86_400_000);
    const end = new Date(start.getTime() + 7 * 86_400_000);
    const { year, week } = isoWeek(start);
    return {
      key: `${year}-W${pad(week)}`,
      start,
      end,
      label: `Week of ${shortDate(start)}`,
    };
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return {
    key: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}`,
    start,
    end,
    label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
  };
}

/** When the performance window opens: `days` back from now. */
export function windowStart(now: Date, days: number): Date {
  return new Date(now.getTime() - Math.max(1, days) * 86_400_000);
}

/** One row of a board before it is ranked. */
export interface Standing {
  agentId: string;
  /** What the board counts: sales made, recruits registered, sales in window. */
  score: number;
  /** The tie-break: cedis behind the count. */
  value: number;
  /** Only used by the performance board, and only to hold ties steady. */
  joinedAt?: Date;
}

/** One ranked row. */
export interface RankedStanding extends Standing {
  rank: number;
}

/**
 * Rank a board.
 *
 * Score first, then value, then the agent id — the last one purely so the
 * order is stable. Two agents who genuinely tie share a rank, which is the
 * honest answer and also the one that stops a board reshuffling on every
 * refresh for no visible reason. The rank after a shared one skips, as places
 * do: two firsts are followed by a third.
 */
export function rankStandings(standings: Standing[]): RankedStanding[] {
  const sorted = [...standings].sort(
    (a, b) => b.score - a.score || b.value - a.value || a.agentId.localeCompare(b.agentId),
  );

  const ranked: RankedStanding[] = [];
  let rank = 0;
  let previous: Standing | null = null;
  sorted.forEach((row, index) => {
    if (!previous || previous.score !== row.score || previous.value !== row.value) {
      rank = index + 1;
    }
    ranked.push({ ...row, rank });
    previous = row;
  });
  return ranked;
}

/** The eligibility rules for the Current Performance board. */
export interface PerformanceRules {
  minAgentAgeDays: number;
  minQualifyingSales: number;
}

/**
 * May this agent appear on the Current Performance board?
 *
 * The board exists so a newer agent can compete with an established one, which
 * only works if what it measures is real. A brand-new account with two sales
 * would otherwise top it on its first afternoon, and an established agent
 * would rightly stop believing in the whole thing.
 */
export function performanceEligible(
  agent: { joinedAt: Date; salesInWindow: number },
  rules: PerformanceRules,
  now: Date,
): boolean {
  const ageDays = (now.getTime() - agent.joinedAt.getTime()) / 86_400_000;
  if (ageDays < rules.minAgentAgeDays) return false;
  if (agent.salesInWindow < rules.minQualifyingSales) return false;
  return true;
}

/** What a place is worth. Anything below third pays nothing. */
export function pointsForRank(rank: number, points: [number, number, number]): number {
  if (rank < 1 || rank > 3) return 0;
  return Math.max(0, Math.round(points[rank - 1] ?? 0));
}

/** How good a recent performance is, when it is good enough to be worth saying. */
export type PerformanceGrade = "EXCEPTIONAL" | "EXCELLENT" | null;

export interface PerformanceBonusRules {
  excellentSales: number;
  excellentPoints: number;
  exceptionalSales: number;
  exceptionalPoints: number;
}

/**
 * Grade a performance by the sales behind it.
 *
 * Exceptional is checked first, so an agent who clears both bars is graded on
 * the better one rather than on whichever was written first. A bar of zero is
 * off, not "everybody qualifies" — a grade every agent has says nothing.
 */
export function performanceGrade(
  salesInWindow: number,
  rules: PerformanceBonusRules,
): PerformanceGrade {
  if (rules.exceptionalSales > 0 && salesInWindow >= rules.exceptionalSales) return "EXCEPTIONAL";
  if (rules.excellentSales > 0 && salesInWindow >= rules.excellentSales) return "EXCELLENT";
  return null;
}

/** What that grade pays. */
export function pointsForGrade(grade: PerformanceGrade, rules: PerformanceBonusRules): number {
  if (grade === "EXCEPTIONAL") return Math.max(0, Math.round(rules.exceptionalPoints));
  if (grade === "EXCELLENT") return Math.max(0, Math.round(rules.excellentPoints));
  return 0;
}

/**
 * The slice of a board to show on a dashboard: the top few, and the agent's
 * own neighbours when they are further down.
 *
 * Showing the top three alone tells an agent in 40th place nothing they can
 * act on. Showing their neighbours tells them exactly what catching one more
 * person is worth — which is the entire point of a leaderboard.
 */
export function boardExcerpt<T extends { agentId: string }>(
  rows: T[],
  agentId: string | null,
  topCount = 3,
  neighbours = 1,
): { top: T[]; near: T[] } {
  const top = rows.slice(0, topCount);
  const index = agentId ? rows.findIndex((r) => r.agentId === agentId) : -1;
  if (index < 0 || index < topCount) return { top, near: [] };

  const from = Math.max(topCount, index - neighbours);
  const to = Math.min(rows.length, index + neighbours + 1);
  return { top, near: rows.slice(from, to) };
}

/** How many points are still needed for the cheapest reward out of reach. */
export function pointsToNextReward(
  balance: number,
  rewardCosts: number[],
): { next: number; needed: number } | null {
  const ahead = rewardCosts.filter((cost) => cost > balance).sort((a, b) => a - b);
  if (ahead.length === 0) return null;
  return { next: ahead[0], needed: ahead[0] - balance };
}
