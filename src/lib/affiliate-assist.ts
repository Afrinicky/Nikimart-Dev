import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/commission";
import {
  assistName,
  deriveFollowUps,
  hasUnread,
  stageSummary,
  TOPIC_LABELS,
  THREAD_STATUS_LABELS,
  type AssistRole,
  type FollowUpItem,
  type FollowUpOrder,
  type FollowUpThread,
} from "@/lib/affiliate-assist-rules";
import { deriveStatus, stageAt, type ShipmentRoute, type ShipmentTimestamps } from "@/lib/tracking";

/**
 * Everything the affiliate's assistance work reads.
 *
 * The principle this module is built around is in what it does *not* select.
 * An affiliate helping a buyer needs the order's contents and where it has got
 * to; they do not need what was paid, by what method, on what plan, or what is
 * still owed — and they do not need the buyer's address, phone number or email
 * either, because they talk to them through Nickimart, which is what leaves a
 * record of what was promised. Every `select` here is written out in full for
 * that reason: an `include` would quietly hand over the next column somebody
 * adds to Order.
 *
 * Reads only. The writes live in affiliate-assist-actions.ts, where the guard
 * can be applied once per action.
 */

// ---------------------------------------------------------------------------
// What a thread looks like to a console
// ---------------------------------------------------------------------------

export interface ThreadRow {
  id: string;
  kind: string;
  topic: string;
  topicLabel: string;
  subject: string;
  status: string;
  statusLabel: string;
  priority: string;
  /** The other party, as this console is allowed to see them. */
  who: string;
  customerId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  lastMessageAt: Date | null;
  lastMessageRole: string;
  lastMessageText: string;
  unread: boolean;
  messageCount: number;
  createdAt: Date;
  resolvedAt: Date | null;
}

const THREAD_SELECT = {
  id: true,
  affiliateId: true,
  kind: true,
  topic: true,
  subject: true,
  status: true,
  priority: true,
  customerId: true,
  orderId: true,
  lastMessageAt: true,
  lastMessageRole: true,
  lastMessageText: true,
  affiliateReadAt: true,
  customerReadAt: true,
  supportReadAt: true,
  createdAt: true,
  resolvedAt: true,
  resolution: true,
  escalatedFromId: true,
  customer: { select: { id: true, name: true } },
  // The order number and nothing else: a thread list has no business knowing
  // what an order cost.
  order: { select: { id: true, orderNumber: true } },
  _count: { select: { messages: true } },
} as const;

type ThreadRecord = {
  id: string;
  affiliateId: string;
  kind: string;
  topic: string;
  subject: string;
  status: string;
  priority: string;
  customerId: string | null;
  orderId: string | null;
  lastMessageAt: Date | null;
  lastMessageRole: string;
  lastMessageText: string;
  affiliateReadAt: Date | null;
  customerReadAt: Date | null;
  supportReadAt: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
  customer: { id: string; name: string | null } | null;
  order: { id: string; orderNumber: string } | null;
  _count: { messages: number };
};

function toThreadRow(t: ThreadRecord, role: AssistRole): ThreadRow {
  return {
    id: t.id,
    kind: t.kind,
    topic: t.topic,
    topicLabel: TOPIC_LABELS[t.topic] ?? "Question",
    subject: t.subject,
    status: t.status,
    statusLabel: THREAD_STATUS_LABELS[t.status] ?? t.status,
    priority: t.priority,
    who:
      t.kind === "support"
        ? "Nickimart support"
        : role === "customer"
          ? "Your Nickimart helper"
          : assistName(t.customer?.name),
    customerId: t.customerId,
    orderId: t.orderId,
    orderNumber: t.order?.orderNumber ?? null,
    lastMessageAt: t.lastMessageAt,
    lastMessageRole: t.lastMessageRole,
    lastMessageText: t.lastMessageText,
    unread: hasUnread(t, role),
    messageCount: t._count.messages,
    createdAt: t.createdAt,
    resolvedAt: t.resolvedAt,
  };
}

// ---------------------------------------------------------------------------
// The inbox
// ---------------------------------------------------------------------------

export const THREAD_FILTER_OPTIONS = [
  { value: "all", label: "All conversations" },
  { value: "unread", label: "Unread" },
  { value: "mine", label: "Needs my reply" },
  { value: "waiting", label: "Waiting on others" },
  { value: "resolved", label: "Resolved" },
];

export const THREAD_KIND_OPTIONS = [
  { value: "all", label: "Customers and Nickimart" },
  { value: "customer", label: "Customers" },
  { value: "support", label: "Nickimart support" },
];

export interface ThreadQuery {
  kind?: string;
  filter?: string;
  q?: string;
  page?: number;
  perPage?: number;
}

/**
 * This affiliate's conversations.
 *
 * "Unread" and "needs my reply" are filtered after the read rather than in
 * SQL. They are derived from two timestamps and a role, and expressing that as
 * a Prisma `where` would mean the rule living in two places — which is how the
 * list and the badge end up disagreeing.
 */
export async function getThreads(
  affiliateId: string,
  query: ThreadQuery = {},
): Promise<{ rows: ThreadRow[]; total: number }> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const kind = query.kind ?? "all";
  const filter = query.filter ?? "all";
  const term = (query.q ?? "").trim();

  const where = {
    affiliateId,
    ...(kind !== "all" ? { kind } : {}),
    ...(filter === "resolved" ? { status: "resolved" } : {}),
    ...(filter === "mine" ? { status: { in: ["open", "waiting_affiliate"] } } : {}),
    ...(filter === "waiting" ? { status: { in: ["waiting_customer", "waiting_support"] } } : {}),
    ...(term
      ? {
          OR: [
            { subject: { contains: term, mode: "insensitive" as const } },
            { lastMessageText: { contains: term, mode: "insensitive" as const } },
            { order: { orderNumber: { contains: term.toUpperCase() } } },
            { customer: { name: { contains: term, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  try {
    // Unread cannot be expressed in the query, so that one filter pages over a
    // wider read and slices afterwards. Everything else pages in SQL.
    if (filter === "unread") {
      const all = await prisma.affiliateThread.findMany({
        where,
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        take: 500,
        select: THREAD_SELECT,
      });
      const unread = all.map((t) => toThreadRow(t, "affiliate")).filter((t) => t.unread);
      return {
        total: unread.length,
        rows: unread.slice((page - 1) * perPage, page * perPage),
      };
    }

    const [total, rows] = await Promise.all([
      prisma.affiliateThread.count({ where }),
      prisma.affiliateThread.findMany({
        where,
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        select: THREAD_SELECT,
      }),
    ]);
    return { total, rows: rows.map((t) => toThreadRow(t, "affiliate")) };
  } catch {
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// One thread
// ---------------------------------------------------------------------------

export interface AssistMessage {
  id: string;
  authorRole: string;
  authorName: string;
  body: string;
  internal: boolean;
  /** True when this repeats an answer Nickimart gave. */
  verified: boolean;
  createdAt: Date;
  mine: boolean;
}

export interface ThreadDetail extends ThreadRow {
  resolution: string;
  /** The customer thread an escalation came from, when it is one. */
  escalatedFromId: string | null;
  /** Escalations raised from this thread. */
  escalationIds: string[];
  messages: AssistMessage[];
}

/**
 * One conversation, from one party's side.
 *
 * `role` decides two things: which messages are visible — an internal note is
 * the author's own record and is never shown to the other side — and whose
 * read mark is used. A customer reading their own thread sees exactly what was
 * addressed to them.
 */
export async function getThread(
  threadId: string,
  viewer: { role: AssistRole; affiliateId?: string; userId?: string },
): Promise<ThreadDetail | null> {
  try {
    const t = await prisma.affiliateThread.findUnique({
      where: { id: threadId },
      select: {
        ...THREAD_SELECT,
        escalations: { select: { id: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            authorRole: true,
            authorName: true,
            authorId: true,
            body: true,
            internal: true,
            relayedFromId: true,
            createdAt: true,
          },
        },
        resolution: true,
      },
    });
    if (!t) return null;

    // The guard: a thread belongs to its affiliate and its customer, and
    // support sees all of them. Anything else is not found rather than
    // forbidden — there is nothing to be learnt from the difference.
    if (viewer.role === "affiliate" && t.affiliateId !== viewer.affiliateId) return null;
    if (viewer.role === "customer" && t.customerId !== viewer.userId) return null;

    const row = toThreadRow(t, viewer.role);
    return {
      ...row,
      resolution: t.resolution,
      escalatedFromId: t.escalatedFromId,
      escalationIds: t.escalations.map((e) => e.id),
      messages: t.messages
        .filter((m) => !m.internal || m.authorRole === viewer.role)
        .map((m) => ({
          id: m.id,
          authorRole: m.authorRole,
          authorName: m.authorName,
          body: m.body,
          internal: m.internal,
          verified: Boolean(m.relayedFromId),
          createdAt: m.createdAt,
          mine: m.authorRole === viewer.role,
        })),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// An order, as the affiliate who referred it may see it
// ---------------------------------------------------------------------------

export interface AssistOrderItem {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  image: string | null;
  quantity: number;
  /** The shelf price of the line. Not what was charged, settled or still owed. */
  lineTotal: number;
  shopName: string;
  /** Whether this line is one this affiliate earns on. */
  earning: boolean;
}

export interface AssistOrderStep {
  stage: string;
  label: string;
  at: Date | null;
  done: boolean;
  current: boolean;
}

export interface AssistOrder {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  /** Goods value. The bill — fees, duty, what is outstanding — is withheld. */
  subtotal: number;
  items: AssistOrderItem[];
  itemCount: number;
  buyer: string;
  customerId: string | null;
  /** "Delivery" or the pickup point's name. Never a street address. */
  destination: string;
  deliveryMethod: string;
  trackingNumber: string | null;
  carrier: string | null;
  eta: Date | null;
  route: ShipmentRoute;
  stage: string;
  stageLabel: string;
  stageAt: Date | null;
  timestamps: ShipmentTimestamps;
  /** This affiliate's commission on it, net of reversals, and where it stands. */
  commission: number;
  commissionStatus: string;
  threadId: string | null;
}

/**
 * One referred order, with the parcel's position and none of the money.
 *
 * The buyer's address is deliberately absent: what an affiliate needs to chase
 * a delivery is which Nickimart point it is going to, which is what the
 * shipment's destination already says. A home address adds nothing to the job
 * and is somebody's home.
 */
export async function getAssistOrder(
  affiliateId: string,
  orderId: string,
): Promise<AssistOrder | null> {
  try {
    const o = await prisma.order.findFirst({
      where: { id: orderId, affiliateId },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        status: true,
        subtotal: true,
        deliveryMethod: true,
        hasAbroadItems: true,
        affiliateCommission: true,
        userId: true,
        user: { select: { id: true, name: true } },
        pickupPoint: { select: { name: true, locationName: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                emoji: true,
                image: true,
                vendor: { select: { businessName: true } },
              },
            },
          },
        },
        shipment: {
          select: {
            trackingNumber: true,
            carrier: true,
            eta: true,
            processingAt: true,
            transitAt: true,
            outForDeliveryAt: true,
            deliveredAt: true,
            forwarderReceivedAt: true,
            arrivedGhanaAt: true,
          },
        },
        affiliateCommissions: {
          where: { affiliateId },
          select: { amount: true, reversedAmount: true, status: true, productId: true },
        },
        affiliateThreads: {
          where: { affiliateId, kind: "customer" },
          orderBy: { lastMessageAt: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!o) return null;

    const timestamps: ShipmentTimestamps = {
      processingAt: o.shipment?.processingAt ?? null,
      transitAt: o.shipment?.transitAt ?? null,
      outForDeliveryAt: o.shipment?.outForDeliveryAt ?? null,
      deliveredAt: o.shipment?.deliveredAt ?? null,
      forwarderReceivedAt: o.shipment?.forwarderReceivedAt ?? null,
      arrivedGhanaAt: o.shipment?.arrivedGhanaAt ?? null,
    };
    const route: ShipmentRoute = o.hasAbroadItems ? "abroad" : "domestic";
    const stage = deriveStatus(timestamps, route);
    const earning = new Set(o.affiliateCommissions.map((c) => c.productId));

    const ledger = o.affiliateCommissions;
    const commission = ledger.length
      ? money(ledger.reduce((s, c) => s + Math.max(0, c.amount - c.reversedAmount), 0))
      : money(o.affiliateCommission);

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      status: o.status,
      subtotal: money(o.subtotal),
      items: o.items.map((i) => ({
        id: i.id,
        name: i.product.name,
        slug: i.product.slug,
        emoji: i.product.emoji,
        image: i.product.image,
        quantity: i.quantity,
        lineTotal: money(i.unitPrice * i.quantity),
        shopName: i.product.vendor?.businessName ?? "Nickimart",
        earning: earning.has(i.product.id),
      })),
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      buyer: assistName(o.user?.name),
      customerId: o.user?.id ?? o.userId ?? null,
      destination: o.pickupPoint
        ? `${o.pickupPoint.name} — ${o.pickupPoint.locationName}`
        : o.deliveryMethod === "pickup"
          ? "A Nickimart pickup point"
          : "Home delivery",
      deliveryMethod: o.deliveryMethod,
      trackingNumber: o.shipment?.trackingNumber ?? null,
      carrier: o.shipment?.carrier ?? null,
      eta: o.shipment?.eta ?? null,
      route,
      stage,
      stageLabel: stageSummary(o.status, stage),
      stageAt: stageAt(timestamps, stage as never) ?? null,
      timestamps,
      commission,
      commissionStatus:
        ledger.find((c) => c.status === "reversed")?.status ?? ledger[0]?.status ?? "pending",
      threadId: o.affiliateThreads[0]?.id ?? null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The people behind the links
// ---------------------------------------------------------------------------

export interface AssistCustomerRow {
  userId: string;
  name: string;
  /** buyer | visitor — whether they have bought or only clicked. */
  kind: "buyer" | "visitor";
  orders: number;
  /** Goods value across their referred orders. */
  spend: number;
  firstSeenAt: Date | null;
  lastOrderAt: Date | null;
  lastContactAt: Date | null;
  openThreads: number;
  unread: boolean;
  threadId: string | null;
  /** Which of their orders is most recent, for a one-click jump. */
  lastOrderId: string | null;
}

export const CUSTOMER_FILTER_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "buyer", label: "Bought something" },
  { value: "visitor", label: "Clicked, not bought" },
  { value: "uncontacted", label: "Never contacted" },
  { value: "unread", label: "Waiting on me" },
];

/**
 * Everybody this affiliate's links have reached, by name.
 *
 * Two sources, because a link produces two kinds of person: somebody who
 * clicked and signed in, who is a prospect, and somebody who bought, who is a
 * customer. Clicks by a visitor who never signed in cannot be here at all —
 * there is nobody to name and nobody to write to, which is the honest answer
 * and is said on the screen rather than hidden by an empty table.
 */
export async function getAssistCustomers(
  affiliateId: string,
  query: { q?: string; filter?: string; page?: number; perPage?: number } = {},
): Promise<{ rows: AssistCustomerRow[]; total: number; anonymousClicks: number }> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const filter = query.filter ?? "all";
  const term = (query.q ?? "").trim().toLowerCase();

  try {
    const [orders, referrals, threads, anonymous] = await Promise.all([
      prisma.order.findMany({
        where: { affiliateId, status: { not: "pending" } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          subtotal: true,
          userId: true,
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.affiliateReferral.findMany({
        where: { affiliateId, userId: { not: null } },
        select: { userId: true, firstSeenAt: true },
      }),
      prisma.affiliateThread.findMany({
        where: { affiliateId, kind: "customer", customerId: { not: null } },
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          customerId: true,
          status: true,
          lastMessageAt: true,
          lastMessageRole: true,
          affiliateReadAt: true,
          customerReadAt: true,
          supportReadAt: true,
        },
      }),
      prisma.affiliateReferral.count({ where: { affiliateId, userId: null } }),
    ]);

    // AffiliateReferral carries a bare userId — there is no relation to follow,
    // because an attribution outlives the account it was made on. So the names
    // of people who clicked but never ordered are looked up here.
    const clickOnly = [...new Set(referrals.map((r) => r.userId).filter(Boolean))] as string[];
    const clickUsers = clickOnly.length
      ? await prisma.user.findMany({
          where: { id: { in: clickOnly } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(clickUsers.map((u) => [u.id, u.name]));

    const byUser = new Map<string, AssistCustomerRow>();

    const seed = (id: string, name: string | null, kind: "buyer" | "visitor"): AssistCustomerRow => {
      const existing = byUser.get(id);
      if (existing) {
        if (kind === "buyer") existing.kind = "buyer";
        return existing;
      }
      const row: AssistCustomerRow = {
        userId: id,
        name: assistName(name),
        kind,
        orders: 0,
        spend: 0,
        firstSeenAt: null,
        lastOrderAt: null,
        lastContactAt: null,
        openThreads: 0,
        unread: false,
        threadId: null,
        lastOrderId: null,
      };
      byUser.set(id, row);
      return row;
    };

    for (const r of referrals) {
      if (!r.userId) continue;
      const row = seed(r.userId, nameById.get(r.userId) ?? null, "visitor");
      row.firstSeenAt = row.firstSeenAt
        ? new Date(Math.min(row.firstSeenAt.getTime(), r.firstSeenAt.getTime()))
        : r.firstSeenAt;
    }

    for (const o of orders) {
      const id = o.user?.id ?? o.userId;
      if (!id) continue;
      const row = seed(id, o.user?.name ?? null, "buyer");
      row.orders += 1;
      row.spend = money(row.spend + o.subtotal);
      if (!row.lastOrderAt || o.createdAt > row.lastOrderAt) {
        row.lastOrderAt = o.createdAt;
        row.lastOrderId = o.id;
      }
      if (!row.firstSeenAt || o.createdAt < row.firstSeenAt) row.firstSeenAt = o.createdAt;
    }

    for (const t of threads) {
      if (!t.customerId) continue;
      const row = byUser.get(t.customerId);
      if (!row) continue;
      if (!row.threadId) row.threadId = t.id;
      if (t.status !== "resolved") row.openThreads += 1;
      if (t.lastMessageAt && (!row.lastContactAt || t.lastMessageAt > row.lastContactAt)) {
        row.lastContactAt = t.lastMessageAt;
      }
      if (hasUnread(t, "affiliate")) row.unread = true;
    }

    let rows = [...byUser.values()];
    if (term) rows = rows.filter((r) => r.name.toLowerCase().includes(term));
    if (filter === "buyer") rows = rows.filter((r) => r.kind === "buyer");
    if (filter === "visitor") rows = rows.filter((r) => r.kind === "visitor");
    if (filter === "uncontacted") rows = rows.filter((r) => !r.lastContactAt);
    if (filter === "unread") rows = rows.filter((r) => r.unread);

    rows.sort((a, b) => {
      // Somebody waiting on a reply comes first, then the most recent order,
      // then the most recent sighting.
      if (a.unread !== b.unread) return a.unread ? -1 : 1;
      const at = a.lastOrderAt?.getTime() ?? a.firstSeenAt?.getTime() ?? 0;
      const bt = b.lastOrderAt?.getTime() ?? b.firstSeenAt?.getTime() ?? 0;
      return bt - at;
    });

    return {
      total: rows.length,
      rows: rows.slice((page - 1) * perPage, page * perPage),
      anonymousClicks: anonymous,
    };
  } catch {
    return { rows: [], total: 0, anonymousClicks: 0 };
  }
}

export interface AssistCustomerDetail {
  userId: string;
  name: string;
  kind: "buyer" | "visitor";
  firstSeenAt: Date | null;
  orders: {
    id: string;
    orderNumber: string;
    createdAt: Date;
    status: string;
    stageLabel: string;
    subtotal: number;
    items: number;
    commission: number;
  }[];
  spend: number;
  commission: number;
  threads: ThreadRow[];
  /** What they clicked, most recent first — the prospect's own interests. */
  interests: { name: string; slug: string | null; at: Date }[];
}

/** One person: what they bought through this affiliate, and what was said. */
export async function getAssistCustomer(
  affiliateId: string,
  userId: string,
): Promise<AssistCustomerDetail | null> {
  try {
    // The attribution first: its visitor id is the only way back to what this
    // person clicked, and there is no relation to join on.
    const referral = await prisma.affiliateReferral.findFirst({
      where: { affiliateId, userId },
      select: { firstSeenAt: true, visitorId: true },
    });

    const [user, orders, threads, clicks] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
      prisma.order.findMany({
        where: { affiliateId, userId, status: { not: "pending" } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          subtotal: true,
          hasAbroadItems: true,
          affiliateCommission: true,
          items: { select: { quantity: true } },
          shipment: {
            select: {
              processingAt: true,
              transitAt: true,
              outForDeliveryAt: true,
              deliveredAt: true,
              forwarderReceivedAt: true,
              arrivedGhanaAt: true,
            },
          },
          affiliateCommissions: {
            where: { affiliateId },
            select: { amount: true, reversedAmount: true },
          },
        },
      }),
      prisma.affiliateThread.findMany({
        where: { affiliateId, customerId: userId },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        take: 50,
        select: THREAD_SELECT,
      }),
      referral
        ? prisma.affiliateClick.findMany({
            where: { affiliateId, visitorId: referral.visitorId },
            orderBy: { createdAt: "desc" },
            take: 8,
            select: { productId: true, createdAt: true },
          })
        : Promise.resolve([] as { productId: string | null; createdAt: Date }[]),
    ]);
    if (!user) return null;
    if (orders.length === 0 && !referral && threads.length === 0) return null;

    const productIds = [...new Set(clicks.map((c) => c.productId).filter(Boolean))] as string[];
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));

    const mapped = orders.map((o) => {
      const timestamps: ShipmentTimestamps = {
        processingAt: o.shipment?.processingAt ?? null,
        transitAt: o.shipment?.transitAt ?? null,
        outForDeliveryAt: o.shipment?.outForDeliveryAt ?? null,
        deliveredAt: o.shipment?.deliveredAt ?? null,
        forwarderReceivedAt: o.shipment?.forwarderReceivedAt ?? null,
        arrivedGhanaAt: o.shipment?.arrivedGhanaAt ?? null,
      };
      const route: ShipmentRoute = o.hasAbroadItems ? "abroad" : "domestic";
      const ledger = o.affiliateCommissions;
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        status: o.status,
        stageLabel: stageSummary(o.status, deriveStatus(timestamps, route)),
        subtotal: money(o.subtotal),
        items: o.items.reduce((s, i) => s + i.quantity, 0),
        commission: ledger.length
          ? money(ledger.reduce((s, c) => s + Math.max(0, c.amount - c.reversedAmount), 0))
          : money(o.affiliateCommission),
      };
    });

    return {
      userId: user.id,
      name: assistName(user.name),
      kind: orders.length > 0 ? "buyer" : "visitor",
      firstSeenAt: referral?.firstSeenAt ?? mapped.at(-1)?.createdAt ?? null,
      orders: mapped,
      spend: money(mapped.reduce((s, o) => s + o.subtotal, 0)),
      commission: money(mapped.reduce((s, o) => s + o.commission, 0)),
      threads: threads.map((t) => toThreadRow(t, "affiliate")),
      interests: clicks.map((c) => ({
        name: c.productId ? (byId.get(c.productId)?.name ?? "Removed listing") : "The store itself",
        slug: c.productId ? (byId.get(c.productId)?.slug ?? null) : null,
        at: c.createdAt,
      })),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Outstanding actions
// ---------------------------------------------------------------------------

export interface FollowUpBoard {
  items: FollowUpItem[];
  /** Counted before paging, for the badge. */
  overdue: number;
}

/**
 * What this affiliate owes somebody, derived on the spot.
 *
 * The orders and threads are read in full rather than paged: the list is a
 * working queue, it is read by one person about their own work, and an
 * affiliate with so many referred orders that this is expensive has a much
 * nicer problem than a slow page.
 */
export async function getFollowUps(affiliateId: string, now = new Date()): Promise<FollowUpBoard> {
  try {
    const [orders, threads, handled, contacts] = await Promise.all([
      prisma.order.findMany({
        where: { affiliateId, status: { not: "pending" } },
        orderBy: { createdAt: "desc" },
        take: 300,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          createdAt: true,
          hasAbroadItems: true,
          userId: true,
          user: { select: { name: true } },
          shipment: {
            select: {
              processingAt: true,
              transitAt: true,
              outForDeliveryAt: true,
              deliveredAt: true,
              forwarderReceivedAt: true,
              arrivedGhanaAt: true,
            },
          },
        },
      }),
      prisma.affiliateThread.findMany({
        where: { affiliateId, status: { not: "resolved" } },
        orderBy: { lastMessageAt: "desc" },
        take: 300,
        select: {
          id: true,
          kind: true,
          status: true,
          topic: true,
          subject: true,
          lastMessageAt: true,
          lastMessageRole: true,
          customer: { select: { name: true } },
          order: { select: { orderNumber: true } },
          // A support answer counts as relayed once a message quoting it has
          // been written anywhere.
          messages: {
            where: { relayedFromId: { not: null } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
          escalations: { select: { id: true } },
        },
      }),
      prisma.affiliateFollowUp.findMany({
        where: { affiliateId },
        select: { key: true },
      }),
      // When this affiliate last wrote to each buyer about each order.
      prisma.affiliateThread.findMany({
        where: { affiliateId, kind: "customer", orderId: { not: null } },
        select: { orderId: true, lastMessageAt: true, messages: { select: { id: true }, take: 1 } },
      }),
    ]);

    const relayedByThread = new Map<string, Date | null>();
    for (const t of threads) relayedByThread.set(t.id, t.messages[0]?.createdAt ?? null);

    const contactByOrder = new Map<string, Date | null>();
    for (const c of contacts) {
      if (!c.orderId) continue;
      const seen = contactByOrder.get(c.orderId);
      if (!seen || (c.lastMessageAt && c.lastMessageAt > seen)) {
        contactByOrder.set(c.orderId, c.lastMessageAt);
      }
    }

    // An escalation's answer is relayed when the customer thread it came from
    // has carried a relayed message since.
    const followUpOrders: FollowUpOrder[] = orders.map((o) => {
      const timestamps: ShipmentTimestamps = {
        processingAt: o.shipment?.processingAt ?? null,
        transitAt: o.shipment?.transitAt ?? null,
        outForDeliveryAt: o.shipment?.outForDeliveryAt ?? null,
        deliveredAt: o.shipment?.deliveredAt ?? null,
        forwarderReceivedAt: o.shipment?.forwarderReceivedAt ?? null,
        arrivedGhanaAt: o.shipment?.arrivedGhanaAt ?? null,
      };
      const route: ShipmentRoute = o.hasAbroadItems ? "abroad" : "domestic";
      const stage = deriveStatus(timestamps, route);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        createdAt: o.createdAt,
        stage,
        stageAt: stageAt(timestamps, stage as never) ?? null,
        buyer: assistName(o.user?.name),
        contacted: contactByOrder.has(o.id),
        lastContactAt: contactByOrder.get(o.id) ?? null,
      };
    });

    const followUpThreads: FollowUpThread[] = threads.map((t) => ({
      id: t.id,
      kind: t.kind,
      status: t.status,
      topic: t.topic,
      subject: t.subject,
      who: assistName(t.customer?.name),
      orderNumber: t.order?.orderNumber ?? null,
      lastMessageAt: t.lastMessageAt,
      lastMessageRole: t.lastMessageRole,
      relayedAt: relayedByThread.get(t.id) ?? null,
    }));

    const items = deriveFollowUps({
      orders: followUpOrders,
      threads: followUpThreads,
      handledKeys: handled.map((h) => h.key),
      now,
    });

    return { items, overdue: items.filter((i) => i.urgency === "overdue").length };
  } catch {
    return { items: [], overdue: 0 };
  }
}

// ---------------------------------------------------------------------------
// The badge
// ---------------------------------------------------------------------------

export interface AssistSummary {
  /** Conversations with something in them this affiliate has not read. */
  unread: number;
  /** Conversations whose next move is theirs. */
  waiting: number;
  /** Outstanding actions, and how many are late. */
  followUps: number;
  overdue: number;
  /** Enquiries with Nickimart that are still open. */
  escalations: number;
  people: number;
}

/**
 * The counts the console's navigation and dashboard need.
 *
 * Cached per request, because the shell, the dashboard and the follow-up page
 * all ask for it on the same render.
 */
export const getAssistSummary = cache(async (affiliateId: string): Promise<AssistSummary> => {
  try {
    const [threads, board, people] = await Promise.all([
      prisma.affiliateThread.findMany({
        where: { affiliateId },
        select: {
          kind: true,
          status: true,
          lastMessageAt: true,
          lastMessageRole: true,
          affiliateReadAt: true,
          customerReadAt: true,
          supportReadAt: true,
        },
      }),
      getFollowUps(affiliateId),
      prisma.affiliateThread
        .findMany({
          where: { affiliateId, customerId: { not: null } },
          distinct: ["customerId"],
          select: { customerId: true },
        })
        .then((rows) => rows.length),
    ]);

    return {
      unread: threads.filter((t) => hasUnread(t, "affiliate")).length,
      waiting: threads.filter((t) => t.status === "waiting_affiliate" || t.status === "open").length,
      followUps: board.items.length,
      overdue: board.overdue,
      escalations: threads.filter((t) => t.kind === "support" && t.status !== "resolved").length,
      people,
    };
  } catch {
    return { unread: 0, waiting: 0, followUps: 0, overdue: 0, escalations: 0, people: 0 };
  }
});

export type { FollowUpItem };

// ---------------------------------------------------------------------------
// The buyer's side
// ---------------------------------------------------------------------------

export interface OrderHelper {
  /** The affiliate's own name, as they chose it. */
  name: string;
  threadId: string | null;
  messages: AssistMessage[];
}

/**
 * The person looking after this buyer's order, if anybody is.
 *
 * Read from the buyer's side, so the guard is their own order rather than an
 * affiliate id from a form. The affiliate's name is shown — somebody told
 * "Kwame recommended this and is looking after it" knows who they are talking
 * to, which is the whole value of having been recommended by a person.
 */
export async function getOrderHelper(
  userId: string,
  orderNumber: string,
): Promise<OrderHelper | null> {
  try {
    const order = await prisma.order.findFirst({
      where: { orderNumber, userId },
      select: {
        id: true,
        affiliateId: true,
        affiliate: { select: { name: true, status: true } },
      },
    });
    if (!order?.affiliateId || !order.affiliate) return null;

    const thread = await prisma.affiliateThread.findFirst({
      where: {
        affiliateId: order.affiliateId,
        kind: "customer",
        customerId: userId,
        orderId: order.id,
      },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true },
    });

    const detail = thread
      ? await getThread(thread.id, { role: "customer", userId })
      : null;

    return {
      name: order.affiliate.name || "Your Nickimart helper",
      threadId: detail?.id ?? null,
      messages: detail?.messages ?? [],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Nickimart's side
// ---------------------------------------------------------------------------

export interface SupportQueueRow extends ThreadRow {
  affiliateId: string;
  affiliateName: string;
  affiliateCode: string;
  /** How long it has been waiting on Nickimart, in hours. */
  waitingHours: number;
}

export const SUPPORT_QUEUE_OPTIONS = [
  { value: "open", label: "Needs an answer" },
  { value: "all", label: "Every enquiry" },
  { value: "answered", label: "Answered, with the affiliate" },
  { value: "resolved", label: "Closed" },
];

export const SUPPORT_PRIORITY_OPTIONS = [
  { value: "all", label: "Any priority" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
];

/**
 * The enquiries affiliates have put to Nickimart.
 *
 * Ordered by what is waiting longest at the top of the priority it was raised
 * at, because that is the queue's actual job: an affiliate with a customer
 * asking them for the third time is the person this screen exists for.
 */
export async function getSupportQueue(
  query: { status?: string; priority?: string; q?: string; page?: number; perPage?: number } = {},
): Promise<{ rows: SupportQueueRow[]; total: number; open: number; urgent: number }> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const status = query.status ?? "open";
  const priority = query.priority ?? "all";
  const term = (query.q ?? "").trim();

  const where = {
    kind: "support",
    ...(status === "open" ? { status: { in: ["open", "waiting_support"] } } : {}),
    ...(status === "answered" ? { status: "waiting_affiliate" } : {}),
    ...(status === "resolved" ? { status: "resolved" } : {}),
    ...(priority !== "all" ? { priority } : {}),
    ...(term
      ? {
          OR: [
            { subject: { contains: term, mode: "insensitive" as const } },
            { lastMessageText: { contains: term, mode: "insensitive" as const } },
            { order: { orderNumber: { contains: term.toUpperCase() } } },
            { affiliate: { name: { contains: term, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  try {
    const [total, open, urgent, rows] = await Promise.all([
      prisma.affiliateThread.count({ where }),
      prisma.affiliateThread.count({
        where: { kind: "support", status: { in: ["open", "waiting_support"] } },
      }),
      prisma.affiliateThread.count({
        where: { kind: "support", status: { in: ["open", "waiting_support"] }, priority: "urgent" },
      }),
      prisma.affiliateThread.findMany({
        where,
        // Urgent before high before normal, then the longest wait.
        orderBy: [{ priority: "asc" }, { lastMessageAt: "asc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          ...THREAD_SELECT,
          affiliate: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);

    const now = Date.now();
    return {
      total,
      open,
      urgent,
      rows: rows.map((t) => ({
        ...toThreadRow(t, "support"),
        affiliateId: t.affiliate.id,
        affiliateName: t.affiliate.name,
        affiliateCode: t.affiliate.code ?? "",
        waitingHours: t.lastMessageAt
          ? Math.max(0, Math.round((now - t.lastMessageAt.getTime()) / 3_600_000))
          : 0,
      })),
    };
  } catch {
    return { rows: [], total: 0, open: 0, urgent: 0 };
  }
}

/** One enquiry, with who raised it and what it is about. */
export async function getEnquiry(threadId: string): Promise<
  | (ThreadDetail & {
      affiliateId: string;
      affiliateName: string;
      affiliateCode: string;
      customerName: string | null;
    })
  | null
> {
  const detail = await getThread(threadId, { role: "support" });
  if (!detail) return null;

  const extra = await prisma.affiliateThread
    .findUnique({
      where: { id: threadId },
      select: {
        affiliate: { select: { id: true, name: true, code: true } },
        customer: { select: { name: true } },
      },
    })
    .catch(() => null);
  if (!extra) return null;

  return {
    ...detail,
    affiliateId: extra.affiliate.id,
    affiliateName: extra.affiliate.name,
    affiliateCode: extra.affiliate.code ?? "",
    customerName: extra.customer ? assistName(extra.customer.name) : null,
  };
}

/** How many enquiries are waiting on Nickimart, for the module's tab row. */
export async function countOpenEnquiries(): Promise<number> {
  return prisma.affiliateThread
    .count({ where: { kind: "support", status: { in: ["open", "waiting_support"] } } })
    .catch(() => 0);
}
