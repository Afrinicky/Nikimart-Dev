import "server-only";
import { prisma } from "@/lib/prisma";
import { maskPhone, toView, type CollectionView } from "@/lib/pickup-collection";

/**
 * Every parcel that is going over a counter, in one place.
 *
 * Collection used to be visible only from inside a single point's dashboard,
 * which meant nobody could answer the questions that actually matter across
 * the network: what is sitting uncollected and for how long, which point is
 * holding it, how many parcels went out without the buyer's code, and whether
 * anybody is failing codes repeatedly at one counter. All four are either a
 * cost or a warning sign, and all four were invisible.
 *
 * The queue is the point of the screen, so the default sort is oldest first:
 * a parcel that has been on a shelf for three weeks is the one somebody has to
 * do something about.
 */

export const PICKUP_FILTER_OPTIONS = [
  { value: "awaiting", label: "Awaiting collection" },
  { value: "ready", label: "Ready, code sent" },
  { value: "overdue", label: "Uncollected over 7 days" },
  { value: "locked", label: "Code locked" },
  { value: "collected", label: "Collected" },
  { value: "override", label: "Released without a code" },
  { value: "all", label: "Every pickup" },
] as const;

export type PickupFilter = (typeof PICKUP_FILTER_OPTIONS)[number]["value"];

export function pickupFilter(raw: string | undefined): PickupFilter {
  const value = (raw ?? "").trim();
  return (PICKUP_FILTER_OPTIONS.some((o) => o.value === value) ? value : "awaiting") as PickupFilter;
}

/** A parcel is chased once it has sat at its point for this long. */
export const OVERDUE_DAYS = 7;

export interface PickupRow {
  id: string;
  orderNumber: string;
  total: number;
  balanceDue: number;
  status: string;
  buyerName: string;
  buyerPhone: string;
  buyerPhoneMasked: string;
  pointId: string | null;
  pointName: string;
  pointCode: string;
  /** When the parcel was confirmed ready at the point. */
  readyAt: Date | null;
  collectedAt: Date | null;
  /** Whole days since it was ready and still uncollected. */
  waitingDays: number | null;
  overdue: boolean;
  collection: CollectionView | null;
}

export interface PickupSummary {
  points: number;
  awaiting: number;
  readyWithCode: number;
  overdue: number;
  locked: number;
  collectedThisWeek: number;
  overrides: number;
  /** Cash still to be taken at the counter on goods-only orders. */
  balanceAtCounter: number;
}

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

interface Loaded {
  rows: PickupRow[];
}

/**
 * Every pickup order with its collection record attached.
 *
 * One read rather than a join per row: a mall's pickup book is thousands of
 * orders, and the filters below are about derived things — how long something
 * has waited, whether a code is live — that SQL would need stored columns to
 * answer. Those columns would be a fourth place the truth lives.
 */
async function loadPickups(): Promise<Loaded> {
  const orders = await prisma.order
    .findMany({
      where: { deliveryMethod: "pickup", status: { not: "cancelled" } },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        balanceDue: true,
        status: true,
        createdAt: true,
        user: { select: { name: true, email: true, phone: true } },
        pickupPoint: { select: { id: true, name: true, code: true } },
        shipment: { select: { outForDeliveryAt: true, deliveredAt: true } },
        pickupCollection: true,
      },
      orderBy: { createdAt: "asc" },
      take: 2000,
    })
    .catch(() => []);

  const rows: PickupRow[] = orders.map((o) => {
    const collection = o.pickupCollection ? toView(o.pickupCollection) : null;
    const readyAt = o.shipment?.outForDeliveryAt ?? null;
    const collectedAt = collection?.collectedAt ?? o.shipment?.deliveredAt ?? null;
    const waitingDays = collectedAt ? null : daysSince(readyAt);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      total: o.total,
      balanceDue: o.balanceDue,
      status: o.status,
      buyerName: o.user.name ?? o.user.email,
      buyerPhone: o.user.phone ?? "",
      buyerPhoneMasked: maskPhone(o.user.phone),
      pointId: o.pickupPoint?.id ?? null,
      pointName: o.pickupPoint?.name ?? "No point set",
      pointCode: o.pickupPoint?.code ?? "",
      readyAt,
      collectedAt,
      waitingDays,
      overdue: waitingDays !== null && waitingDays >= OVERDUE_DAYS,
      collection,
    };
  });

  return { rows };
}

function matches(row: PickupRow, filter: PickupFilter): boolean {
  switch (filter) {
    case "awaiting":
      return !row.collectedAt;
    case "ready":
      return !row.collectedAt && Boolean(row.collection?.hasLiveCode);
    case "overdue":
      return row.overdue;
    case "locked":
      return Boolean(row.collection?.locked);
    case "collected":
      return Boolean(row.collectedAt);
    case "override":
      return row.collection?.method === "override";
    default:
      return true;
  }
}

export interface PickupPage {
  rows: PickupRow[];
  total: number;
  counts: Record<string, number>;
  summary: PickupSummary;
  points: { id: string; name: string; code: string }[];
}

/**
 * The table, its filter counts and the headline numbers, from one read.
 *
 * The counts travel with the rows so a filter can say how many it would show
 * before anybody picks it: a dropdown that cannot tell you an option leads
 * nowhere is a dead end, and "Code locked (0)" is more useful than finding out
 * the hard way.
 */
export async function getPickupBoard(input: {
  filter: PickupFilter;
  point?: string;
  query?: string;
  page?: number;
  perPage?: number;
}): Promise<PickupPage> {
  const { rows } = await loadPickups();
  const perPage = input.perPage ?? 25;
  const page = Math.max(1, input.page ?? 1);

  const pointIds = new Map<string, { id: string; name: string; code: string }>();
  for (const r of rows) {
    if (r.pointId) pointIds.set(r.pointId, { id: r.pointId, name: r.pointName, code: r.pointCode });
  }

  const weekAgo = Date.now() - 7 * 86_400_000;
  const summary: PickupSummary = {
    points: pointIds.size,
    awaiting: rows.filter((r) => !r.collectedAt).length,
    readyWithCode: rows.filter((r) => !r.collectedAt && r.collection?.hasLiveCode).length,
    overdue: rows.filter((r) => r.overdue).length,
    locked: rows.filter((r) => r.collection?.locked).length,
    collectedThisWeek: rows.filter(
      (r) => r.collectedAt && r.collectedAt.getTime() >= weekAgo,
    ).length,
    overrides: rows.filter((r) => r.collection?.method === "override").length,
    balanceAtCounter: rows
      .filter((r) => !r.collectedAt && r.balanceDue > 0)
      .reduce((sum, r) => sum + r.balanceDue, 0),
  };

  const q = (input.query ?? "").trim().toLowerCase();
  const narrowed = rows.filter((r) => {
    if (input.point && input.point !== "all" && r.pointId !== input.point) return false;
    if (!q) return true;
    return (
      r.orderNumber.toLowerCase().includes(q) ||
      r.buyerName.toLowerCase().includes(q) ||
      r.buyerPhone.includes(q) ||
      r.collection?.collectorName.toLowerCase().includes(q) === true
    );
  });

  const counts: Record<string, number> = {};
  for (const option of PICKUP_FILTER_OPTIONS) {
    counts[option.value] = narrowed.filter((r) => matches(r, option.value)).length;
  }

  const matched = narrowed.filter((r) => matches(r, input.filter));
  // Waiting longest first while uncollected; most recent first once collected,
  // because the question changes from "what is stuck" to "what just happened".
  const sorted =
    input.filter === "collected" || input.filter === "override"
      ? [...matched].sort(
          (a, b) => (b.collectedAt?.getTime() ?? 0) - (a.collectedAt?.getTime() ?? 0),
        )
      : [...matched].sort((a, b) => (b.waitingDays ?? -1) - (a.waitingDays ?? -1));

  return {
    rows: sorted.slice((page - 1) * perPage, page * perPage),
    total: sorted.length,
    counts,
    summary,
    points: [...pointIds.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
