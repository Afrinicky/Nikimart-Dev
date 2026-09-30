import "server-only";
import { dataDb } from "@/lib/data-db";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { networkLabel } from "@/lib/data-bundles/networks";
import { getAgentUser } from "@/lib/data-bundles/user-link";
import {
  bucketSize,
  OVERVIEW_RANGES,
  previousRange as before,
  resolveWindow,
  type OverviewRange,
  type OverviewWindow,
} from "@/lib/data-bundles/overview-window";

/**
 * What the bundle business looks like over a window.
 *
 * The overview used to be a wall of all-time totals: revenue since the store
 * opened, every order ever delivered. Those are true and almost useless — they
 * only ever go up, so nothing on the screen could tell you whether today was
 * good. Everything here is scoped to a window instead, and compared against
 * the window before it, because "GH₵4,100" means nothing and "GH₵4,100, up a
 * fifth on the fortnight before" means something.
 *
 * The window itself is a value rather than a number of days, because three
 * preset lengths could not answer the two questions people actually brought to
 * this screen: what has this business done in total, and what did it do in
 * that fortnight in March. All time and an arbitrary pair of dates are windows
 * like any other, and every read below takes one — so nothing had to learn a
 * second way of being filtered.
 */

export { OVERVIEW_RANGES, resolveWindow };
export type { OverviewRange, OverviewWindow };

/** The `createdAt` filter for a window. An open start means all time. */
function within(w: OverviewWindow) {
  return { createdAt: { ...(w.start ? { gte: w.start } : {}), lt: w.end } };
}

export interface DayPoint {
  /** YYYY-MM-DD, local. The first day of the bucket. */
  day: string;
  /** The last day of the bucket, when it covers more than one. */
  endDay?: string;
  orders: number;
  revenue: number;
  cost: number;
  margin: number;
}

/**
 * The window as a series, including the stretches that sold nothing.
 *
 * The empty buckets matter: a trend drawn only through the days that traded
 * compresses a quiet week into a single point and makes a dip look like a
 * plateau. Read in one query and bucketed here rather than in SQL, so the days
 * line up with the admin's own clock rather than the database's.
 *
 * Long windows are bucketed into weeks or months rather than drawn as seven
 * hundred one-pixel days. The shape is the point; a mark too narrow to hover
 * is not a data point, it is texture.
 */
export async function getDailySeries(
  w: OverviewWindow,
  opts: { agentId?: string } = {},
): Promise<DayPoint[]> {
  const start = w.start ?? (await firstOrderDay(opts.agentId));
  if (!start) return [];

  const span = Math.max(1, Math.round((w.end.getTime() - start.getTime()) / 86_400_000));
  const size = bucketSize(span);
  const count = Math.ceil(span / size);

  const buckets: DayPoint[] = Array.from({ length: count }, (_, i) => {
    const from = new Date(start);
    from.setDate(start.getDate() + i * size);
    const to = new Date(from);
    to.setDate(from.getDate() + size - 1);
    // The last bucket stops at the window's end rather than running past it.
    const last = new Date(w.end);
    last.setDate(last.getDate() - 1);
    return {
      day: dayKey(from),
      ...(size > 1 ? { endDay: dayKey(to > last ? last : to) } : {}),
      orders: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
    };
  });

  let rows: { createdAt: Date; price: number; costPrice: number }[];
  try {
    rows = await dataDb.dataOrder.findMany({
      where: {
        ...(opts.agentId ? { agentId: opts.agentId } : {}),
        paymentStatus: "paid",
        status: { not: "refunded" },
        ...within(w),
      },
      select: { createdAt: true, price: true, costPrice: true },
    });
  } catch {
    return buckets;
  }

  for (const row of rows) {
    const offset = Math.floor((startOfDay(row.createdAt).getTime() - start.getTime()) / 86_400_000);
    const point = buckets[Math.floor(offset / size)];
    if (!point) continue;
    point.orders += 1;
    point.revenue = round2(point.revenue + row.price);
    point.cost = round2(point.cost + row.costPrice);
    point.margin = round2(point.revenue - point.cost);
  }
  return buckets;
}

/**
 * When the business — or one agent — first traded, for an all-time series.
 *
 * Scoped to the agent when there is one: an agent who joined last month should
 * not get a chart with two years of flat nothing in front of their first sale.
 */
async function firstOrderDay(agentId?: string): Promise<Date | null> {
  try {
    const first = await dataDb.dataOrder.findFirst({
      where: { ...(agentId ? { agentId } : {}), paymentStatus: "paid" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    return first ? startOfDay(first.createdAt) : null;
  } catch {
    return null;
  }
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface WindowTotals {
  orders: number;
  revenue: number;
  cost: number;
  margin: number;
  /** Orders that came through an agent, and what Nickimart kept on them. */
  agentOrders: number;
  agentRevenue: number;
  /**
   * What the agent network earned Nickimart: what the customer paid, less the
   * agent's commission, less their recruiter's cut, less what the bundle cost
   * from the provider. Every figure is the one snapshotted on the order, so a
   * later price or rate change never rewrites what a past sale made.
   */
  agentIncome: number;
  /** The same figures for the window before. Null when there is no baseline. */
  previous: { orders: number; revenue: number } | null;
}

/** Totals for the window, and the window before it. */
export async function getWindowTotals(w: OverviewWindow): Promise<WindowTotals> {
  const where = { paymentStatus: "paid" as const, status: { not: "refunded" } };
  const previousRange = before(w);
  const empty: WindowTotals = {
    orders: 0,
    revenue: 0,
    cost: 0,
    margin: 0,
    agentOrders: 0,
    agentRevenue: 0,
    agentIncome: 0,
    previous: null,
  };

  try {
    const [now, agent, earlier] = await Promise.all([
      dataDb.dataOrder.aggregate({
        where: { ...where, ...within(w) },
        _count: { _all: true },
        _sum: { price: true, costPrice: true },
      }),
      dataDb.dataOrder.aggregate({
        where: { ...where, agentId: { not: null }, ...within(w) },
        _count: { _all: true },
        _sum: { price: true, costPrice: true, agentCommission: true, teamCommission: true },
      }),
      previousRange
        ? dataDb.dataOrder.aggregate({
            where: { ...where, createdAt: previousRange },
            _count: { _all: true },
            _sum: { price: true },
          })
        : Promise.resolve(null),
    ]);

    const revenue = round2(now._sum.price ?? 0);
    const cost = round2(now._sum.costPrice ?? 0);
    const agentRevenue = round2(agent._sum.price ?? 0);
    return {
      orders: now._count._all,
      revenue,
      cost,
      margin: round2(revenue - cost),
      agentOrders: agent._count._all,
      agentRevenue,
      agentIncome: round2(
        agentRevenue -
          (agent._sum.costPrice ?? 0) -
          (agent._sum.agentCommission ?? 0) -
          (agent._sum.teamCommission ?? 0),
      ),
      previous: earlier
        ? { orders: earlier._count._all, revenue: round2(earlier._sum.price ?? 0) }
        : null,
    };
  } catch {
    return empty;
  }
}

/**
 * One agent's trading over the window, and over the window before it.
 *
 * Deliberately not the same shape as the lifetime wallet above it. The wallet
 * answers "what does this account hold" — a balance, everything ever earned,
 * everything ever withdrawn — and those are facts about the account that a
 * date range has no business changing. This answers "how did they do in this
 * stretch", which is the question a range is for. The screen keeps them apart
 * for the same reason: a window figure sitting in a row of lifetime ones gets
 * read as a lifetime one, and then the numbers do not add up.
 *
 * Paid and not refunded, matching the trend and the leaderboard — a cancelled
 * sale is not trading, and a commission on it was reversed.
 */
export interface AgentWindowTotals {
  orders: number;
  /** What customers paid through this agent, before anything comes out of it. */
  sales: number;
  cost: number;
  /** What the agent earned on their own sales. */
  agentCommission: number;
  /** What their recruiter earned on those same sales. */
  teamCommission: number;
  /** What Nickimart kept: sales, less cost and both commissions. */
  income: number;
  previous: {
    orders: number;
    sales: number;
    agentCommission: number;
    teamCommission: number;
    income: number;
  } | null;
}

const EMPTY_AGENT_TOTALS: AgentWindowTotals = {
  orders: 0,
  sales: 0,
  cost: 0,
  agentCommission: 0,
  teamCommission: 0,
  income: 0,
  previous: null,
};

export async function getAgentWindowTotals(
  agentId: string,
  w: OverviewWindow,
): Promise<AgentWindowTotals> {
  const traded = { agentId, paymentStatus: "paid" as const, status: { not: "refunded" } };
  const previousRange = before(w);

  try {
    const [now, earlier] = await Promise.all([
      dataDb.dataOrder.aggregate({
        where: { ...traded, ...within(w) },
        _count: { _all: true },
        _sum: { price: true, costPrice: true, agentCommission: true, teamCommission: true },
      }),
      previousRange
        ? dataDb.dataOrder.aggregate({
            where: { ...traded, createdAt: previousRange },
            _count: { _all: true },
            _sum: { price: true, costPrice: true, agentCommission: true, teamCommission: true },
          })
        : Promise.resolve(null),
    ]);

    // The same subtraction the leaderboard and the per-order column make, so
    // a tile, a row and the league table cannot disagree about "income".
    const kept = (a: {
      _sum: {
        price: number | null;
        costPrice: number | null;
        agentCommission: number | null;
        teamCommission: number | null;
      };
    }) =>
      round2(
        (a._sum.price ?? 0) -
          (a._sum.costPrice ?? 0) -
          (a._sum.agentCommission ?? 0) -
          (a._sum.teamCommission ?? 0),
      );

    return {
      orders: now._count._all,
      sales: round2(now._sum.price ?? 0),
      cost: round2(now._sum.costPrice ?? 0),
      agentCommission: round2(now._sum.agentCommission ?? 0),
      teamCommission: round2(now._sum.teamCommission ?? 0),
      income: kept(now),
      previous: earlier
        ? {
            orders: earlier._count._all,
            sales: round2(earlier._sum.price ?? 0),
            agentCommission: round2(earlier._sum.agentCommission ?? 0),
            teamCommission: round2(earlier._sum.teamCommission ?? 0),
            income: kept(earlier),
          }
        : null,
    };
  } catch {
    return EMPTY_AGENT_TOTALS;
  }
}

/**
 * The wallet side of an agent's window: what they had, and what they took out.
 *
 * Both respond to the date picker, but they are different kinds of figure and
 * the screen says so. A withdrawal is a flow — money that moved inside the
 * window — and sums like any other. A balance is not a flow: there is no such
 * thing as "the balance during March". What there is, and what this returns,
 * is the balance the account stood at when the window closed, which is the
 * honest way to make a standing figure answer a date.
 */
export interface AgentWindowWallet {
  /** What the account stood at when the window closed. */
  balance: number;
  /** Withdrawals actually paid out inside the window. */
  withdrawn: number;
  previous: { withdrawn: number } | null;
}

export async function getAgentWindowWallet(
  agentId: string,
  w: OverviewWindow,
  currentBalance: number,
): Promise<AgentWindowWallet> {
  const previousRange = before(w);

  try {
    const [closing, withdrawn, earlier] = await Promise.all([
      // Every ledger row records the balance it left behind, so the closing
      // balance is the last row before the window ends rather than a replay of
      // the account's whole history.
      dataDb.dataAgentLedger.findFirst({
        where: { agentId, createdAt: { lt: w.end } },
        orderBy: { createdAt: "desc" },
        select: { balanceAfter: true },
      }),
      dataDb.dataAgentWithdrawal.aggregate({
        where: {
          agentId,
          status: "processed",
          // When it was paid, not when it was asked for: a payout belongs to
          // the window the money actually left in.
          processedAt: { ...(w.start ? { gte: w.start } : {}), lt: w.end },
        },
        _sum: { amount: true },
      }),
      previousRange
        ? dataDb.dataAgentWithdrawal.aggregate({
            where: { agentId, status: "processed", processedAt: previousRange },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      // No ledger row before the window closed means the account had not
      // moved yet, which is a balance of zero rather than today's.
      balance: round2(closing?.balanceAfter ?? 0),
      withdrawn: round2(withdrawn._sum.amount ?? 0),
      previous: earlier ? { withdrawn: round2(earlier._sum.amount ?? 0) } : null,
    };
  } catch {
    // The ledger is unreadable, so the closing balance is unknown. Today's is
    // the one figure that is certainly true, and an all-time window wants it
    // anyway.
    return { balance: round2(currentBalance), withdrawn: 0, previous: null };
  }
}

export interface MixSlice {
  key: string;
  label: string;
  orders: number;
  revenue: number;
}

/** What sold, by network, over the window. Biggest first. */
export async function getNetworkMix(w: OverviewWindow): Promise<MixSlice[]> {
  try {
    const rows = await dataDb.dataOrder.groupBy({
      by: ["network"],
      where: { paymentStatus: "paid", status: { not: "refunded" }, ...within(w) },
      _count: { _all: true },
      _sum: { price: true },
    });
    return rows
      .map((r) => ({
        key: r.network,
        label: networkLabel(r.network),
        orders: r._count._all,
        revenue: round2(r._sum.price ?? 0),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  } catch {
    return [];
  }
}

/** Where every order in the window ended up. */
export async function getStatusMix(w: OverviewWindow): Promise<Record<string, number>> {
  try {
    const rows = await dataDb.dataOrder.groupBy({
      by: ["status"],
      where: { paymentStatus: "paid", ...within(w) },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  } catch {
    return {};
  }
}

/** How orders reached us — a storefront, an agent's dashboard, the main site. */
export async function getSourceMix(w: OverviewWindow): Promise<MixSlice[]> {
  const LABELS: Record<string, string> = {
    WEB: "Nickimart site",
    STOREFRONT: "Agent storefronts",
    AGENT: "Agent dashboards",
  };
  try {
    const rows = await dataDb.dataOrder.groupBy({
      by: ["source"],
      where: { paymentStatus: "paid", status: { not: "refunded" }, ...within(w) },
      _count: { _all: true },
      _sum: { price: true },
    });
    return rows
      .map((r) => ({
        key: r.source,
        label: LABELS[r.source] ?? r.source,
        orders: r._count._all,
        revenue: round2(r._sum.price ?? 0),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  } catch {
    return [];
  }
}

export interface AgentPerformance {
  id: string;
  code: string;
  storeName: string;
  ownerName: string;
  orders: number;
  sales: number;
  commission: number;
  /**
   * What Nickimart kept on their sales: what the customer paid, less this
   * agent's commission, less their recruiter's cut, less the bundle's cost.
   * The figures are the ones snapshotted on each order, so a later price or
   * rate change never rewrites what a past sale made.
   */
  income: number;
  recruits: number;
  status: string;
}

/**
 * Who is actually selling, over the window.
 *
 * Deliberately not lifetime figures: an agent who sold hard for a month in
 * February and nothing since outranks everybody on a lifetime board forever,
 * which is the opposite of what a performance list is for.
 */
export async function getAgentPerformance(
  w: OverviewWindow,
  limit = 8,
): Promise<{ rows: AgentPerformance[]; sellingAgents: number }> {
  try {
    const sales = await dataDb.dataOrder.groupBy({
      by: ["agentId"],
      where: {
        paymentStatus: "paid",
        status: { not: "refunded" },
        agentId: { not: null },
        ...within(w),
      },
      _count: { _all: true },
      _sum: { price: true, costPrice: true, agentCommission: true, teamCommission: true },
    });
    if (sales.length === 0) return { rows: [], sellingAgents: 0 };

    const ranked = sales
      .map((s) => ({
        id: s.agentId as string,
        orders: s._count._all,
        sales: round2(s._sum.price ?? 0),
        commission: round2(s._sum.agentCommission ?? 0),
        income: round2(
          (s._sum.price ?? 0) -
            (s._sum.costPrice ?? 0) -
            (s._sum.agentCommission ?? 0) -
            (s._sum.teamCommission ?? 0),
        ),
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, limit);

    const agents = await dataDb.dataAgent.findMany({
      where: { id: { in: ranked.map((r) => r.id) } },
      select: { id: true, code: true, storeName: true, status: true, userId: true },
    });
    const byId = new Map(agents.map((a) => [a.id, a]));

    // Recruits are counted per agent rather than joined: the relation points
    // the other way, and this is at most a handful of rows.
    const recruits = await dataDb.dataAgent.groupBy({
      by: ["referredById"],
      where: { referredById: { in: ranked.map((r) => r.id) } },
      _count: { _all: true },
    });
    const recruitsById = new Map(recruits.map((r) => [r.referredById as string, r._count._all]));

    const rows = await Promise.all(
      ranked.map(async (r) => {
        const agent = byId.get(r.id);
        const user = agent ? await getAgentUser(agent.userId) : null;
        return {
          ...r,
          code: agent?.code ?? "—",
          storeName: agent?.storeName ?? "Removed agent",
          ownerName: user?.name ?? "",
          status: agent?.status ?? "removed",
          recruits: recruitsById.get(r.id) ?? 0,
        };
      }),
    );

    return { rows, sellingAgents: sales.length };
  } catch {
    return { rows: [], sellingAgents: 0 };
  }
}

/** Percentage change between two figures, or null when there is no baseline. */
export function changePercent(now: number, before: number | undefined | null): number | null {
  if (before === undefined || before === null || before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}
