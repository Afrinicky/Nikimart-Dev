import "server-only";
import { prisma } from "@/lib/prisma";
import { bucketSize, dayKey, type OverviewWindow } from "@/lib/data-bundles/overview-window";
import {
  deriveStage,
  FULFILMENT_LABELS,
  type FulfilmentStage,
} from "@/lib/retail/fulfilment";

/**
 * How long every order has been where it is.
 *
 * The console could say where an order was and never how long it had been
 * there, which is the only thing that turns a status into a job. "At the
 * freight forwarder" is fine on day two and a problem on day thirty, and
 * nothing on the screen could tell the two apart — so an order quietly stuck
 * for six weeks looked exactly like one that moved yesterday, and the first
 * anybody heard of it was the buyer.
 *
 * So each stage gets a target, measured from the moment the order entered it,
 * and anything past its target is surfaced rather than waited on. The targets
 * are deliberately generous and, where the lane knows better, taken from the
 * lane: a forwarder who quotes forty-five days by sea should not have every
 * consignment flagged on day thirty-one.
 *
 * The second half is the promise made to the buyer. A consignment can be
 * inside every stage target and still be late against the date the customer
 * was given at checkout, because the targets are about Nickimart's work and
 * the ETA is about their expectation. Both are tracked; the ETA is the one
 * that costs a customer.
 */

const DAY = 86_400_000;

/** How long a stage should take, in days, before anybody needs to look at it. */
const TARGETS: Record<FulfilmentStage, { abroad: number; domestic: number }> = {
  // A checkout nobody finished. Worth a message the next day.
  awaiting_payment: { abroad: 2, domestic: 2 },
  // Paid for and waiting on the buy. The lane fills or the ordering day comes.
  placing: { abroad: 7, domestic: 1 },
  // Bought. The supplier now has to get it to the forwarder.
  ordered: { abroad: 10, domestic: 2 },
  // Sitting in the forwarder's warehouse abroad, waiting for a container.
  at_forwarder: { abroad: 14, domestic: 2 },
  // On the water or in the air. Overridden by the lane's own quote.
  in_transit: { abroad: 45, domestic: 3 },
  // Landed. Clearing and the run to the pickup point.
  arrived_ghana: { abroad: 7, domestic: 2 },
  // Waiting on the buyer to come for it.
  ready: { abroad: 7, domestic: 5 },
  collected: { abroad: 0, domestic: 0 },
  cancelled: { abroad: 0, domestic: 0 },
};

export type Severity = "ok" | "watch" | "late" | "critical";

export const SEVERITY_LABELS: Record<Severity, string> = {
  ok: "On time",
  watch: "Due soon",
  late: "Late",
  critical: "Badly late",
};

export const SEVERITY_TONES: Record<Severity, string> = {
  ok: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  watch: "bg-niki-gold/20 text-amber-900 ring-1 ring-niki-gold/30",
  late: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  critical: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/25",
};

export const SEVERITY_COLOUR: Record<Severity, string> = {
  ok: "#059669",
  watch: "#d97706",
  late: "#ea580c",
  critical: "#dc2626",
};

/** Human days: "4 days", "19 hours", "just now". */
export function humanDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(ms / DAY);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export interface TrackedOrder {
  id: string;
  orderNumber: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  stage: FulfilmentStage;
  stageLabel: string;
  route: "domestic" | "abroad";
  method: "pickup" | "delivery";
  /** When this order entered the stage it is at. */
  stageSince: Date;
  /** How long it has been there. */
  inStageMs: number;
  /** How long it should take, in days. */
  targetDays: number;
  /** Days past the target. Negative means still inside it. */
  overdueDays: number;
  /** The whole order, from the day it was placed. */
  totalMs: number;
  severity: Severity;
  /** The date the buyer was given, and whether it has passed. */
  eta: Date | null;
  etaOverdueDays: number;
  /** The supplier's own promise, where a purchase recorded one. */
  supplierDue: Date | null;
  supplierOverdueDays: number;
  /** Why this row is flagged, in one line. Empty when it is not. */
  reason: string;
  total: number;
  outstanding: number;
  destination: string;
  trackingNumber: string;
  purchaseId: string | null;
  purchaseReference: string;
}

interface TrackerRow {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  balanceDue: number;
  createdAt: Date;
  deliveryMethod: string;
  hasAbroadItems: boolean;
  address: string | null;
  user: { name: string | null; email: string; phone: string | null };
  pickupPoint: { name: string; locationName: string } | null;
  shipment: {
    createdAt: Date;
    trackingNumber: string;
    eta: Date | null;
    processingAt: Date | null;
    forwarderReceivedAt: Date | null;
    transitAt: Date | null;
    arrivedGhanaAt: Date | null;
    outForDeliveryAt: Date | null;
    deliveredAt: Date | null;
  } | null;
  items: {
    purchaseOrderId: string | null;
    freightRoute: { maxDays: number } | null;
    purchaseOrder: { id: string; reference: string; expectedAt: Date | null; status: string } | null;
  }[];
}

const SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  total: true,
  balanceDue: true,
  createdAt: true,
  deliveryMethod: true,
  hasAbroadItems: true,
  address: true,
  user: { select: { name: true, email: true, phone: true } },
  pickupPoint: { select: { name: true, locationName: true } },
  shipment: {
    select: {
      createdAt: true,
      trackingNumber: true,
      eta: true,
      processingAt: true,
      forwarderReceivedAt: true,
      transitAt: true,
      arrivedGhanaAt: true,
      outForDeliveryAt: true,
      deliveredAt: true,
    },
  },
  items: {
    select: {
      purchaseOrderId: true,
      freightRoute: { select: { maxDays: true } },
      purchaseOrder: {
        select: { id: true, reference: true, expectedAt: true, status: true },
      },
    },
  },
} as const;

/**
 * When an order entered the stage it is at.
 *
 * Each stage but the first two has a confirmation timestamp of its own. The
 * first two do not: an order is "awaiting payment" from the moment it was
 * placed, and "to be placed" from the moment it was paid — which is when its
 * shipment was created, since that is what paying produces.
 */
function stageSince(o: TrackerRow, stage: FulfilmentStage): Date {
  const s = o.shipment;
  switch (stage) {
    case "collected":
      return s?.deliveredAt ?? o.createdAt;
    case "ready":
      return s?.outForDeliveryAt ?? o.createdAt;
    case "arrived_ghana":
      return s?.arrivedGhanaAt ?? o.createdAt;
    case "in_transit":
      return s?.transitAt ?? o.createdAt;
    case "at_forwarder":
      return s?.forwarderReceivedAt ?? o.createdAt;
    case "ordered":
      return s?.processingAt ?? s?.createdAt ?? o.createdAt;
    case "placing":
      return s?.createdAt ?? o.createdAt;
    default:
      return o.createdAt;
  }
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

function track(o: TrackerRow, now: Date): TrackedOrder {
  const route: "domestic" | "abroad" = o.hasAbroadItems ? "abroad" : "domestic";
  const method: "pickup" | "delivery" = o.deliveryMethod === "pickup" ? "pickup" : "delivery";
  const stage = deriveStage({
    status: o.status,
    shipment: o.shipment,
    placed: o.items.some((i) => i.purchaseOrderId),
  });

  const since = stageSince(o, stage);
  const inStageMs = Math.max(0, now.getTime() - since.getTime());

  // The lane's own quote beats the house target for the leg it describes: a
  // forwarder who says forty-five days by sea should not have every
  // consignment flagged on day thirty-one.
  const laneMax = Math.max(0, ...o.items.map((i) => i.freightRoute?.maxDays ?? 0));
  const target =
    stage === "in_transit" && laneMax > 0 ? laneMax : TARGETS[stage][route];
  const overdueDays = target > 0 ? Math.floor(inStageMs / DAY) - target : 0;

  const eta = o.shipment?.eta ?? null;
  const settled = stage === "collected" || stage === "cancelled";
  const etaOverdueDays = eta && !settled ? daysBetween(eta, now) : 0;

  // The supplier's own promise, from the purchase covering this order. Only
  // a live purchase counts — a cancelled one bought nothing to be late with.
  const live = o.items
    .map((i) => i.purchaseOrder)
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.status !== "cancelled");
  const supplierDue = live.find((p) => p.expectedAt)?.expectedAt ?? null;
  const supplierLate =
    supplierDue && (stage === "ordered" || stage === "placing") ? daysBetween(supplierDue, now) : 0;

  const worst = Math.max(overdueDays, etaOverdueDays, supplierLate);
  let severity: Severity = "ok";
  if (settled) severity = "ok";
  else if (worst > 14) severity = "critical";
  else if (worst > 0) severity = "late";
  else if (target > 0 && overdueDays >= -1) severity = "watch";

  const reason = settled
    ? ""
    : etaOverdueDays > 0
      ? `${etaOverdueDays} day${etaOverdueDays === 1 ? "" : "s"} past the date the buyer was given`
      : supplierLate > 0
        ? `${supplierLate} day${supplierLate === 1 ? "" : "s"} past what the supplier promised`
        : overdueDays > 0
          ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} over the ${target}-day target for this stage`
          : severity === "watch"
            ? "Due to move within a day"
            : "";

  const purchase = live[0] ?? null;

  return {
    id: o.id,
    orderNumber: o.orderNumber,
    buyerName: o.user.name?.trim() || o.user.email,
    buyerPhone: o.user.phone ?? "",
    buyerEmail: o.user.email,
    stage,
    stageLabel: FULFILMENT_LABELS[stage],
    route,
    method,
    stageSince: since,
    inStageMs,
    targetDays: target,
    overdueDays,
    totalMs: Math.max(0, now.getTime() - o.createdAt.getTime()),
    severity,
    eta,
    etaOverdueDays: Math.max(0, etaOverdueDays),
    supplierDue,
    supplierOverdueDays: Math.max(0, supplierLate),
    reason,
    total: o.total,
    outstanding: Math.max(0, o.balanceDue),
    destination:
      method === "pickup"
        ? o.pickupPoint
          ? `${o.pickupPoint.name}${o.pickupPoint.locationName ? `, ${o.pickupPoint.locationName}` : ""}`
          : "Pickup point"
        : (o.address?.trim() || "Customer address"),
    trackingNumber: o.shipment?.trackingNumber ?? "",
    purchaseId: purchase?.id ?? null,
    purchaseReference: purchase?.reference ?? "",
  };
}

/**
 * Every order still moving, worst first.
 *
 * Unfiltered by date on purpose: this is the live board, and an order placed
 * in February that is still stuck is the most important row on it.
 */
export async function getLiveTracker(now: Date = new Date()): Promise<TrackedOrder[]> {
  const rows = (await prisma.order.findMany({
    where: { status: { notIn: ["cancelled"] } },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  })) as TrackerRow[];

  const order: Record<Severity, number> = { critical: 0, late: 1, watch: 2, ok: 3 };
  return rows
    .map((o) => track(o, now))
    .sort((a, b) => {
      // Settled orders go last whatever their severity reads.
      const doneA = a.stage === "collected" ? 1 : 0;
      const doneB = b.stage === "collected" ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
      return b.inStageMs - a.inStageMs;
    });
}

export interface TrackerSummary {
  open: number;
  onTime: number;
  watch: number;
  late: number;
  critical: number;
  /** Orders past the date their buyer was given. */
  pastEta: number;
  /** The worst single wait on the board, in ms. */
  longestWaitMs: number;
  longestWaitOrder: string;
  /** Average age of an order still moving. */
  averageAgeMs: number;
}

export function summarise(rows: TrackedOrder[]): TrackerSummary {
  const open = rows.filter((r) => r.stage !== "collected" && r.stage !== "cancelled");
  const longest = open.reduce<TrackedOrder | null>(
    (worst, r) => (!worst || r.inStageMs > worst.inStageMs ? r : worst),
    null,
  );
  return {
    open: open.length,
    onTime: open.filter((r) => r.severity === "ok").length,
    watch: open.filter((r) => r.severity === "watch").length,
    late: open.filter((r) => r.severity === "late").length,
    critical: open.filter((r) => r.severity === "critical").length,
    pastEta: open.filter((r) => r.etaOverdueDays > 0).length,
    longestWaitMs: longest?.inStageMs ?? 0,
    longestWaitOrder: longest?.orderNumber ?? "",
    averageAgeMs:
      open.length > 0 ? Math.round(open.reduce((s, r) => s + r.totalMs, 0) / open.length) : 0,
  };
}

/** How long open orders have been sitting at each stage. */
export function stageLoad(
  rows: TrackedOrder[],
): { key: FulfilmentStage; label: string; count: number; averageMs: number; overdue: number }[] {
  const byStage = new Map<FulfilmentStage, { count: number; total: number; overdue: number }>();
  for (const r of rows) {
    if (r.stage === "collected" || r.stage === "cancelled") continue;
    const at = byStage.get(r.stage) ?? { count: 0, total: 0, overdue: 0 };
    at.count += 1;
    at.total += r.inStageMs;
    if (r.overdueDays > 0) at.overdue += 1;
    byStage.set(r.stage, at);
  }
  return [...byStage]
    .map(([key, v]) => ({
      key,
      label: FULFILMENT_LABELS[key],
      count: v.count,
      averageMs: Math.round(v.total / v.count),
      overdue: v.overdue,
    }))
    .sort((a, b) => b.averageMs - a.averageMs);
}

export interface DeliveredHistory {
  /** Orders handed over inside the window. */
  delivered: number;
  /** Average days from order placed to collected. */
  averageLeadDays: number;
  /** The same, for the window before. Null when there is nothing to compare. */
  previousLeadDays: number | null;
  /** Average days spent at each stage, by the orders that got through it. */
  byStage: { key: string; label: string; days: number }[];
  /** Lead time over the window, bucketed for the chart. */
  series: { day: string; endDay?: string; days: number; count: number }[];
}

/**
 * What finished orders actually took.
 *
 * The live board says what is late; this says what "late" should mean. An
 * average built from the orders that got all the way through is the only
 * honest basis for a target, and it is also the number that says whether the
 * operation is getting faster or slower — which no count of open orders can.
 */
export async function getDeliveredHistory(w: OverviewWindow): Promise<DeliveredHistory> {
  const inWindow = {
    deliveredAt: { ...(w.start ? { gte: w.start } : {}), lt: w.end },
  };

  const rows = await prisma.shipment
    .findMany({
      where: inWindow,
      select: {
        createdAt: true,
        processingAt: true,
        forwarderReceivedAt: true,
        transitAt: true,
        arrivedGhanaAt: true,
        outForDeliveryAt: true,
        deliveredAt: true,
        order: { select: { createdAt: true, hasAbroadItems: true } },
      },
    })
    .catch(() => []);

  const previous =
    w.start && w.days !== null
      ? await prisma.shipment
          .findMany({
            where: {
              deliveredAt: {
                gte: new Date(w.start.getTime() - w.days * DAY),
                lt: w.start,
              },
            },
            select: { deliveredAt: true, order: { select: { createdAt: true } } },
          })
          .catch(() => [])
      : null;

  const leadDays = rows
    .filter((r) => r.deliveredAt)
    .map((r) => (r.deliveredAt!.getTime() - r.order.createdAt.getTime()) / DAY);
  const average = leadDays.length > 0 ? leadDays.reduce((s, d) => s + d, 0) / leadDays.length : 0;

  const previousLead =
    previous && previous.length > 0
      ? previous
          .filter((r) => r.deliveredAt)
          .reduce((s, r) => s + (r.deliveredAt!.getTime() - r.order.createdAt.getTime()) / DAY, 0) /
        previous.length
      : null;

  // Average time in each leg, counted only from the orders that have a pair
  // of timestamps bracketing it.
  const legs: { key: string; label: string; from: (r: (typeof rows)[number]) => Date | null; to: (r: (typeof rows)[number]) => Date | null }[] = [
    { key: "placing", label: FULFILMENT_LABELS.placing, from: (r) => r.createdAt, to: (r) => r.processingAt },
    { key: "ordered", label: FULFILMENT_LABELS.ordered, from: (r) => r.processingAt, to: (r) => r.forwarderReceivedAt ?? r.transitAt },
    { key: "at_forwarder", label: FULFILMENT_LABELS.at_forwarder, from: (r) => r.forwarderReceivedAt, to: (r) => r.transitAt },
    { key: "in_transit", label: FULFILMENT_LABELS.in_transit, from: (r) => r.transitAt, to: (r) => r.arrivedGhanaAt ?? r.outForDeliveryAt },
    { key: "arrived_ghana", label: FULFILMENT_LABELS.arrived_ghana, from: (r) => r.arrivedGhanaAt, to: (r) => r.outForDeliveryAt },
    { key: "ready", label: FULFILMENT_LABELS.ready, from: (r) => r.outForDeliveryAt, to: (r) => r.deliveredAt },
  ];

  const byStage = legs
    .map((leg) => {
      const spans = rows
        .map((r) => {
          const from = leg.from(r);
          const to = leg.to(r);
          return from && to ? (to.getTime() - from.getTime()) / DAY : null;
        })
        .filter((d): d is number => d !== null && d >= 0);
      return {
        key: leg.key,
        label: leg.label,
        days: spans.length > 0 ? Math.round((spans.reduce((s, d) => s + d, 0) / spans.length) * 10) / 10 : 0,
      };
    })
    .filter((s) => s.days > 0);

  return {
    delivered: rows.length,
    averageLeadDays: Math.round(average * 10) / 10,
    previousLeadDays: previousLead === null ? null : Math.round(previousLead * 10) / 10,
    byStage,
    series: leadSeries(rows, w),
  };
}

function leadSeries(
  rows: { deliveredAt: Date | null; order: { createdAt: Date } }[],
  w: OverviewWindow,
): { day: string; endDay?: string; days: number; count: number }[] {
  const done = rows.filter((r) => r.deliveredAt);
  const start =
    w.start ??
    (done.length > 0
      ? new Date(Math.min(...done.map((r) => r.deliveredAt!.getTime())))
      : null);
  if (!start) return [];
  start.setHours(0, 0, 0, 0);

  const span = Math.max(1, Math.round((w.end.getTime() - start.getTime()) / DAY));
  const size = bucketSize(span);
  const count = Math.ceil(span / size);
  const last = new Date(w.end);
  last.setDate(last.getDate() - 1);

  const buckets = Array.from({ length: count }, (_, i) => {
    const from = new Date(start);
    from.setDate(start.getDate() + i * size);
    const to = new Date(from);
    to.setDate(from.getDate() + size - 1);
    return {
      day: dayKey(from),
      ...(size > 1 ? { endDay: dayKey(to > last ? last : to) } : {}),
      days: 0,
      count: 0,
      total: 0,
    };
  });

  for (const r of done) {
    const at = new Date(r.deliveredAt!);
    at.setHours(0, 0, 0, 0);
    const offset = Math.floor((at.getTime() - start.getTime()) / DAY);
    const point = buckets[Math.floor(offset / size)];
    if (!point) continue;
    point.count += 1;
    point.total += (r.deliveredAt!.getTime() - r.order.createdAt.getTime()) / DAY;
  }

  return buckets.map(({ total, ...b }) => ({
    ...b,
    days: b.count > 0 ? Math.round((total / b.count) * 10) / 10 : 0,
  }));
}
