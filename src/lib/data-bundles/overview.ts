import "server-only";
import { dataDb } from "@/lib/data-db";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { networkLabel } from "@/lib/data-bundles/networks";
import { getAgentUser } from "@/lib/data-bundles/user-link";

/**
 * What the bundle business looks like over a window of days.
 *
 * The overview used to be a wall of all-time totals: revenue since the store
 * opened, every order ever delivered. Those are true and almost useless — they
 * only ever go up, so nothing on the screen could tell you whether today was
 * good. Everything here is scoped to a window instead, and compared against
 * the window before it, because "GH₵4,100" means nothing and "GH₵4,100, up a
 * fifth on the fortnight before" means something.
 */

/** The windows the overview offers. Short enough to read, long enough to trend. */
export const OVERVIEW_RANGES = [7, 30, 90] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

export function overviewRange(raw: string | undefined): OverviewRange {
  const n = Number(raw);
  return (OVERVIEW_RANGES as readonly number[]).includes(n) ? (n as OverviewRange) : 30;
}

/** Midnight, `days` ago — the window always starts at the top of a day. */
function windowStart(days: number, endingAt = new Date()): Date {
  const start = new Date(endingAt);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

export interface DayPoint {
  /** YYYY-MM-DD, local. */
  day: string;
  orders: number;
  revenue: number;
  cost: number;
  margin: number;
}

/**
 * One row per day in the window, including the days nothing sold.
 *
 * The zero days matter: a trend drawn only through the days that traded
 * compresses a quiet week into a single point and makes a dip look like a
 * plateau. Read in one query and bucketed here rather than in SQL, so the days
 * line up with the admin's own clock rather than the database's.
 */
export async function getDailySeries(days: number): Promise<DayPoint[]> {
  const start = windowStart(days);
  const empty = () =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { day: dayKey(d), orders: 0, revenue: 0, cost: 0, margin: 0 };
    });

  let rows: { createdAt: Date; price: number; costPrice: number }[];
  try {
    rows = await dataDb.dataOrder.findMany({
      where: {
        paymentStatus: "paid",
        status: { not: "refunded" },
        createdAt: { gte: start },
      },
      select: { createdAt: true, price: true, costPrice: true },
    });
  } catch {
    return empty();
  }

  const byDay = new Map(empty().map((d) => [d.day, d]));
  for (const row of rows) {
    const point = byDay.get(dayKey(row.createdAt));
    if (!point) continue;
    point.orders += 1;
    point.revenue = round2(point.revenue + row.price);
    point.cost = round2(point.cost + row.costPrice);
    point.margin = round2(point.revenue - point.cost);
  }
  return [...byDay.values()];
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
  /** The same figures for the window immediately before, for the comparison. */
  previous: { orders: number; revenue: number };
}

/** Totals for the window, and the window before it. */
export async function getWindowTotals(days: number): Promise<WindowTotals> {
  const start = windowStart(days);
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - days);

  const where = { paymentStatus: "paid" as const, status: { not: "refunded" } };
  try {
    const [now, before] = await Promise.all([
      dataDb.dataOrder.aggregate({
        where: { ...where, createdAt: { gte: start } },
        _count: { _all: true },
        _sum: { price: true, costPrice: true },
      }),
      dataDb.dataOrder.aggregate({
        where: { ...where, createdAt: { gte: previousStart, lt: start } },
        _count: { _all: true },
        _sum: { price: true },
      }),
    ]);
    const revenue = round2(now._sum.price ?? 0);
    const cost = round2(now._sum.costPrice ?? 0);
    return {
      orders: now._count._all,
      revenue,
      cost,
      margin: round2(revenue - cost),
      previous: { orders: before._count._all, revenue: round2(before._sum.price ?? 0) },
    };
  } catch {
    return { orders: 0, revenue: 0, cost: 0, margin: 0, previous: { orders: 0, revenue: 0 } };
  }
}

export interface MixSlice {
  key: string;
  label: string;
  orders: number;
  revenue: number;
}

/** What sold, by network, over the window. Biggest first. */
export async function getNetworkMix(days: number): Promise<MixSlice[]> {
  try {
    const rows = await dataDb.dataOrder.groupBy({
      by: ["network"],
      where: {
        paymentStatus: "paid",
        status: { not: "refunded" },
        createdAt: { gte: windowStart(days) },
      },
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
export async function getStatusMix(days: number): Promise<Record<string, number>> {
  try {
    const rows = await dataDb.dataOrder.groupBy({
      by: ["status"],
      where: { paymentStatus: "paid", createdAt: { gte: windowStart(days) } },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  } catch {
    return {};
  }
}

/** How orders reached us — a storefront, an agent's dashboard, the main site. */
export async function getSourceMix(days: number): Promise<MixSlice[]> {
  const LABELS: Record<string, string> = {
    WEB: "Nickimart site",
    STOREFRONT: "Agent storefronts",
    AGENT: "Agent dashboards",
  };
  try {
    const rows = await dataDb.dataOrder.groupBy({
      by: ["source"],
      where: {
        paymentStatus: "paid",
        status: { not: "refunded" },
        createdAt: { gte: windowStart(days) },
      },
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
  days: number,
  limit = 8,
): Promise<{ rows: AgentPerformance[]; sellingAgents: number }> {
  try {
    const sales = await dataDb.dataOrder.groupBy({
      by: ["agentId"],
      where: {
        paymentStatus: "paid",
        status: { not: "refunded" },
        agentId: { not: null },
        createdAt: { gte: windowStart(days) },
      },
      _count: { _all: true },
      _sum: { price: true, agentCommission: true },
    });
    if (sales.length === 0) return { rows: [], sellingAgents: 0 };

    const ranked = sales
      .map((s) => ({
        id: s.agentId as string,
        orders: s._count._all,
        sales: round2(s._sum.price ?? 0),
        commission: round2(s._sum.agentCommission ?? 0),
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
export function changePercent(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}
