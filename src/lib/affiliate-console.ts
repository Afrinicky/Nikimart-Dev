import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/commission";
import { siteUrl } from "@/lib/site";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { admissionRoute, type AffiliatePolicy, type AdmissionRoute } from "@/lib/affiliate-policy";
import { clearDueCommissions, getLedgerBalance, type LedgerBalance } from "@/lib/affiliate-ledger";
import {
  bucketSize,
  dayKey,
  previousRange,
  type OverviewWindow,
} from "@/lib/data-bundles/overview-window";

/**
 * Everything the affiliate console reads.
 *
 * It is written the way the admin consoles are: every figure is scoped to a
 * window and compared against the window before it, every table is filtered
 * and paged through the query string, and every number leads somewhere. An
 * all-time total only ever goes up, so it cannot tell an affiliate whether
 * this week went well — which is the only question they open this screen to
 * ask.
 *
 * Nothing here writes. The one exception is that reads clear commission whose
 * return window has elapsed, because the passage of time is the single
 * transition nothing else triggers and a balance that is a week stale is a
 * balance somebody will raise a ticket about.
 */

// ---------------------------------------------------------------------------
// Who is this, and may they be here
// ---------------------------------------------------------------------------

export interface AffiliateAccount {
  id: string;
  name: string;
  code: string;
  status: string;
  source: string;
  commissionRate: number | null;
  shareMessage: string;
  flyerTheme: string;
  /** Their own flyer design as stored JSON. Empty means the house style. */
  flyerDesign: string;
  payoutMethod: string;
  payoutName: string;
  payoutNumber: string;
  payoutNetwork: string;
  phone: string;
  email: string;
  createdAt: Date;
  approvedAt: Date | null;
  suspendReason: string;
}

export interface AffiliateWorkspace {
  policy: AffiliatePolicy;
  /** The affiliate account, or null when they do not have one yet. */
  affiliate: AffiliateAccount | null;
  /** What else they are on Nickimart — this decides how they get in. */
  standing: { isSeller: boolean; isAgent: boolean; isAdmin: boolean };
  route: AdmissionRoute;
  /** Their open application, when there is one. */
  application: {
    id: string;
    status: string;
    createdAt: Date;
    decisionNote: string;
  } | null;
}

/**
 * The console's front door.
 *
 * Resolves in one read whether somebody is an affiliate, whether they could
 * be, and by which route — because the three answers are shown on the same
 * screen and asking for them separately produced a page that could say
 * "apply" and "you are already an affiliate" at the same time.
 */
export const getAffiliateWorkspace = cache(
  async (user: { id: string; role: string }): Promise<AffiliateWorkspace> => {
    const [policy, row, vendor, agent, application] = await Promise.all([
      getAffiliatePolicy(),
      prisma.affiliate
        .findUnique({
          where: { userId: user.id },
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            source: true,
            commissionRate: true,
            shareMessage: true,
            flyerTheme: true,
            flyerDesign: true,
            payoutMethod: true,
            payoutName: true,
            payoutNumber: true,
            payoutNetwork: true,
            phone: true,
            email: true,
            createdAt: true,
            approvedAt: true,
            suspendReason: true,
          },
        })
        .catch(() => null),
      prisma.vendor.findUnique({ where: { ownerId: user.id }, select: { id: true } }).catch(() => null),
      getAgentForUser(user.id),
      prisma.affiliateApplication
        .findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, createdAt: true, decisionNote: true },
        })
        .catch(() => null),
    ]);

    const standing = {
      isSeller: Boolean(vendor) || user.role === "SELLER",
      isAgent: Boolean(agent),
      isAdmin: user.role === "ADMIN",
    };

    return {
      policy,
      affiliate: row ? { ...row, code: row.code ?? "" } : null,
      standing,
      route: admissionRoute(standing, policy),
      application: application && application.status === "pending" ? application : application,
    };
  },
);

/** The link an affiliate shares for one product, or for the whole shop. */
export function affiliateLink(linkCode: string): string {
  return `${siteUrl()}/r/${linkCode}`;
}

/** The store-wide link: their code, not a product. */
export function affiliateStoreLink(code: string): string {
  return `${siteUrl()}/r/${code}`;
}

// ---------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------

export interface AffiliateDayPoint {
  day: string;
  endDay?: string;
  clicks: number;
  orders: number;
  sales: number;
  commission: number;
}

export interface AffiliateWindowTotals {
  clicks: number;
  orders: number;
  sales: number;
  commission: number;
  /** Orders per hundred clicks, to one decimal. */
  conversion: number;
  /** Commission per order. */
  perOrder: number;
}

function within(w: OverviewWindow) {
  return { ...(w.start ? { gte: w.start } : {}), lt: w.end };
}

/** Clicks, referred orders, sales and commission over the window. */
export async function getAffiliateWindowTotals(
  affiliateId: string,
  w: OverviewWindow,
): Promise<AffiliateWindowTotals> {
  const [clicks, orders, commissions] = await Promise.all([
    prisma.affiliateClick.count({ where: { affiliateId, createdAt: within(w) } }).catch(() => 0),
    prisma.order
      .findMany({
        where: { affiliateId, createdAt: within(w), status: { not: "pending" } },
        select: { subtotal: true },
      })
      .catch(() => [] as { subtotal: number }[]),
    prisma.affiliateCommission
      .findMany({
        where: { affiliateId, createdAt: within(w) },
        select: { amount: true, reversedAmount: true },
      })
      .catch(() => [] as { amount: number; reversedAmount: number }[]),
  ]);

  const sales = money(orders.reduce((s, o) => s + o.subtotal, 0));
  const commission = money(
    commissions.reduce((s, c) => s + Math.max(0, c.amount - c.reversedAmount), 0),
  );
  return {
    clicks,
    orders: orders.length,
    sales,
    commission,
    conversion: clicks > 0 ? Math.round((orders.length / clicks) * 1000) / 10 : 0,
    perOrder: orders.length > 0 ? money(commission / orders.length) : 0,
  };
}

/** The same totals for the window before this one, or null for all time. */
export async function getAffiliatePreviousTotals(
  affiliateId: string,
  w: OverviewWindow,
): Promise<AffiliateWindowTotals | null> {
  const before = previousRange(w);
  if (!before) return null;
  return getAffiliateWindowTotals(affiliateId, {
    ...w,
    start: before.gte,
    end: before.lt,
  });
}

/**
 * The window as a series, including the stretches where nothing happened.
 *
 * The empty buckets matter: a trend drawn only through the days that sold
 * compresses a quiet week into one point and turns a dip into a plateau. Long
 * windows arrive bucketed into weeks or months rather than as hundreds of
 * one-pixel days.
 */
export async function getAffiliateSeries(
  affiliateId: string,
  w: OverviewWindow,
): Promise<AffiliateDayPoint[]> {
  const start = w.start ?? (await earliestActivity(affiliateId)) ?? new Date(w.end.getTime() - 30 * 86_400_000);
  const spanDays = Math.max(1, Math.round((w.end.getTime() - start.getTime()) / 86_400_000));
  const bucket = bucketSize(spanDays);

  const [clicks, orders, commissions] = await Promise.all([
    prisma.affiliateClick
      .findMany({
        where: { affiliateId, createdAt: { gte: start, lt: w.end } },
        select: { createdAt: true },
      })
      .catch(() => [] as { createdAt: Date }[]),
    prisma.order
      .findMany({
        where: { affiliateId, createdAt: { gte: start, lt: w.end }, status: { not: "pending" } },
        select: { createdAt: true, subtotal: true },
      })
      .catch(() => [] as { createdAt: Date; subtotal: number }[]),
    prisma.affiliateCommission
      .findMany({
        where: { affiliateId, createdAt: { gte: start, lt: w.end } },
        select: { createdAt: true, amount: true, reversedAmount: true },
      })
      .catch(() => [] as { createdAt: Date; amount: number; reversedAmount: number }[]),
  ]);

  const buckets: AffiliateDayPoint[] = [];
  const index = new Map<string, number>();
  for (let cursor = new Date(start); cursor < w.end; cursor.setDate(cursor.getDate() + bucket)) {
    const first = new Date(cursor);
    const last = new Date(cursor);
    last.setDate(last.getDate() + bucket - 1);
    const point: AffiliateDayPoint = {
      day: dayKey(first),
      ...(bucket > 1 ? { endDay: dayKey(last) } : {}),
      clicks: 0,
      orders: 0,
      sales: 0,
      commission: 0,
    };
    index.set(point.day, buckets.length);
    buckets.push(point);
  }
  if (buckets.length === 0) return [];

  const slot = (when: Date): AffiliateDayPoint | null => {
    const offset = Math.floor((when.getTime() - start.getTime()) / 86_400_000 / bucket);
    return buckets[Math.min(buckets.length - 1, Math.max(0, offset))] ?? null;
  };

  for (const c of clicks) slot(c.createdAt)!.clicks += 1;
  for (const o of orders) {
    const point = slot(o.createdAt)!;
    point.orders += 1;
    point.sales = money(point.sales + o.subtotal);
  }
  for (const c of commissions) {
    const point = slot(c.createdAt)!;
    point.commission = money(point.commission + Math.max(0, c.amount - c.reversedAmount));
  }
  return buckets;
}

async function earliestActivity(affiliateId: string): Promise<Date | null> {
  const row = await prisma.affiliateClick
    .findFirst({ where: { affiliateId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } })
    .catch(() => null);
  return row?.createdAt ?? null;
}

export interface AffiliateMixRow {
  key: string;
  label: string;
  value: number;
  note?: string;
  href?: string;
}

/** The products earning the most over the window. */
export async function getTopProducts(
  affiliateId: string,
  w: OverviewWindow,
  limit = 5,
): Promise<AffiliateMixRow[]> {
  const rows = await prisma.affiliateCommission
    .groupBy({
      by: ["productId"],
      where: { affiliateId, createdAt: within(w) },
      _sum: { amount: true },
      _count: { _all: true },
    })
    .catch(() => [] as { productId: string; _sum: { amount: number | null }; _count: { _all: number } }[]);
  if (rows.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: rows.map((r) => r.productId) } },
    select: { id: true, name: true, slug: true },
  });
  const names = new Map(products.map((p) => [p.id, p]));

  return rows
    .map((r) => ({
      key: r.productId,
      label: names.get(r.productId)?.name ?? "Removed listing",
      value: money(r._sum.amount ?? 0),
      note: `${r._count._all} ${r._count._all === 1 ? "sale" : "sales"}`,
      href: `/affiliate/products?q=${encodeURIComponent(names.get(r.productId)?.name ?? "")}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Where the clicks came from over the window. */
export async function getChannelMix(
  affiliateId: string,
  w: OverviewWindow,
  limit = 6,
): Promise<AffiliateMixRow[]> {
  const rows = await prisma.affiliateClick
    .groupBy({
      by: ["channel"],
      where: { affiliateId, createdAt: within(w) },
      _count: { _all: true },
    })
    .catch(() => [] as { channel: string; _count: { _all: number } }[]);

  return rows
    .map((r) => ({
      key: r.channel || "direct",
      label: CHANNEL_LABELS[r.channel] ?? (r.channel ? titleCase(r.channel) : "Direct / WhatsApp"),
      value: r._count._all,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

const CHANNEL_LABELS: Record<string, string> = {
  direct: "Direct / WhatsApp",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X / Twitter",
  telegram: "Telegram",
  snapchat: "Snapchat",
  linkedin: "LinkedIn",
  search: "Search",
  web: "Other websites",
};

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

/** Where every referred order in the window ended up. */
export async function getReferredStatusMix(
  affiliateId: string,
  w: OverviewWindow,
): Promise<Record<string, number>> {
  const rows = await prisma.order
    .groupBy({
      by: ["status"],
      where: { affiliateId, createdAt: within(w) },
      _count: { _all: true },
    })
    .catch(() => [] as { status: string; _count: { _all: number } }[]);
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
}

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

export interface TableQuery {
  status?: string;
  q?: string;
  page?: number;
  perPage?: number;
}

export interface PromotedProductRow {
  id: string;
  productId: string;
  name: string;
  slug: string;
  image: string | null;
  emoji: string;
  shopName: string;
  categoryName: string;
  price: number;
  /** Live eligibility, not what it was when they added it. */
  eligible: boolean;
  rate: number;
  earnPerSale: number;
  fundedBy: string;
  linkCode: string;
  link: string;
  shareMessage: string;
  flyerTheme: string;
  active: boolean;
  clicks: number;
  orders: number;
  commission: number;
  lastSharedAt: Date | null;
  createdAt: Date;
}

export const PROMOTED_STATUS_OPTIONS = [
  { value: "all", label: "All links" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "earning", label: "Has earned" },
  { value: "ineligible", label: "No longer eligible" },
];

/**
 * The affiliate's own list: what they chose to promote, how each link has
 * done, and whether it still pays.
 *
 * Eligibility is re-resolved rather than remembered. A seller can withdraw a
 * product from the programme at any time, and a list that still advertised a
 * commission on it would have an affiliate posting a link that earns nothing.
 */
export async function getPromotedProducts(
  affiliateId: string,
  query: TableQuery = {},
): Promise<{ rows: PromotedProductRow[]; total: number }> {
  const { getAffiliateCatalogue } = await import("@/lib/affiliate-catalogue");
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;

  const [links, catalogue] = await Promise.all([
    prisma.affiliateProduct
      .findMany({
        where: { affiliateId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          productId: true,
          linkCode: true,
          shareMessage: true,
          flyerTheme: true,
          active: true,
          clicks: true,
          lastSharedAt: true,
          createdAt: true,
          product: {
            select: {
              name: true,
              slug: true,
              image: true,
              emoji: true,
              price: true,
              isArchived: true,
              category: { select: { name: true } },
              vendor: { select: { businessName: true } },
              images: { orderBy: { order: "asc" }, take: 1, select: { url: true } },
            },
          },
        },
      })
      .catch(() => []),
    getAffiliateCatalogue(affiliateId, { eligibility: "mine" }, 1, 100_000),
  ]);

  const live = new Map(catalogue.products.map((p) => [p.id, p]));

  // What each link has actually earned, in one query rather than one per row.
  const earned = await prisma.affiliateCommission
    .groupBy({
      by: ["productId"],
      where: { affiliateId },
      _sum: { amount: true, reversedAmount: true },
      _count: { _all: true },
    })
    .catch(() => [] as { productId: string; _sum: { amount: number | null; reversedAmount: number | null }; _count: { _all: number } }[]);
  const byProduct = new Map(earned.map((e) => [e.productId, e]));

  const mapped: PromotedProductRow[] = links
    .filter((l) => l.product && !l.product.isArchived)
    .map((l) => {
      const resolved = live.get(l.productId);
      const stats = byProduct.get(l.productId);
      return {
        id: l.id,
        productId: l.productId,
        name: l.product!.name,
        slug: l.product!.slug,
        image: l.product!.images[0]?.url ?? l.product!.image ?? null,
        emoji: l.product!.emoji,
        shopName: l.product!.vendor?.businessName ?? "Nickimart",
        categoryName: l.product!.category?.name ?? "—",
        price: l.product!.price,
        eligible: resolved?.eligible ?? false,
        rate: resolved?.rate ?? 0,
        earnPerSale: resolved?.earnPerSale ?? 0,
        fundedBy: resolved?.fundedBy ?? "",
        linkCode: l.linkCode,
        link: affiliateLink(l.linkCode),
        shareMessage: l.shareMessage,
        flyerTheme: l.flyerTheme,
        active: l.active,
        clicks: l.clicks,
        orders: stats?._count._all ?? 0,
        commission: money(
          Math.max(0, (stats?._sum.amount ?? 0) - (stats?._sum.reversedAmount ?? 0)),
        ),
        lastSharedAt: l.lastSharedAt,
        createdAt: l.createdAt,
      };
    });

  const term = (query.q ?? "").trim().toLowerCase();
  const filtered = mapped.filter((r) => {
    const status = query.status ?? "all";
    if (status === "active" && !r.active) return false;
    if (status === "paused" && r.active) return false;
    if (status === "earning" && r.commission <= 0) return false;
    if (status === "ineligible" && r.eligible) return false;
    if (term && !`${r.name} ${r.shopName} ${r.categoryName} ${r.linkCode}`.toLowerCase().includes(term)) {
      return false;
    }
    return true;
  });

  const start = (page - 1) * perPage;
  return { rows: filtered.slice(start, start + perPage), total: filtered.length };
}

export interface ReferredOrderRow {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  /** What the buyer spent on goods. */
  subtotal: number;
  /** This affiliate's commission on it, net of reversals. */
  commission: number;
  /** Where that commission stands. */
  commissionStatus: string;
  holdUntil: Date | null;
  items: number;
  /** The products on it this affiliate earned on. */
  products: string;
  /** The buyer, initial-and-surname only. */
  buyer: string;
}

export const REFERRED_ORDER_STATUS_OPTIONS = [
  { value: "all", label: "All orders" },
  { value: "paid", label: "Paid" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * Every order this affiliate referred.
 *
 * The buyer is shown as a first name and an initial, never in full and never
 * with contact details: an affiliate is owed an account of what they earned,
 * not a copy of somebody's customer record.
 */
export async function getReferredOrders(
  affiliateId: string,
  query: TableQuery = {},
): Promise<{ rows: ReferredOrderRow[]; total: number }> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const status = query.status ?? "all";
  const term = (query.q ?? "").trim();

  const where = {
    affiliateId,
    ...(status !== "all" ? { status } : { status: { not: "pending" } }),
    ...(term
      ? { OR: [{ orderNumber: { contains: term.toUpperCase() } }, { items: { some: { product: { name: { contains: term, mode: "insensitive" as const } } } } }] }
      : {}),
  };

  try {
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          subtotal: true,
          affiliateCommission: true,
          user: { select: { name: true } },
          items: { select: { id: true } },
          affiliateCommissions: {
            where: { affiliateId },
            select: {
              amount: true,
              reversedAmount: true,
              status: true,
              holdUntil: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return {
      total,
      rows: orders.map((o) => {
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
          commission,
          commissionStatus: summariseCommissionStatus(ledger.map((c) => c.status), o.status),
          holdUntil: ledger.map((c) => c.holdUntil).filter(Boolean).sort()[0] ?? null,
          items: o.items.length,
          products: ledger.map((c) => c.product.name).join(", ") || "—",
          buyer: shortName(o.user?.name ?? ""),
        };
      }),
    };
  } catch {
    return { rows: [], total: 0 };
  }
}

/**
 * One word for however many commission lines an order has.
 *
 * The worst case wins, because that is the one the affiliate is waiting on: an
 * order with one line cleared and one still in the return window has not
 * cleared.
 */
function summariseCommissionStatus(statuses: string[], orderStatus: string): string {
  if (statuses.length === 0) {
    return orderStatus === "cancelled" ? "reversed" : orderStatus === "delivered" ? "cleared" : "pending";
  }
  for (const rank of ["reversed", "pending", "clearing", "cleared", "paid"]) {
    if (statuses.includes(rank)) return rank;
  }
  return statuses[0];
}

/** "Ama K." — enough to recognise a repeat buyer, not a customer record. */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1).toUpperCase()}.`;
}

export interface CommissionRow {
  id: string;
  orderNumber: string;
  orderId: string;
  productName: string;
  productSlug: string;
  quantity: number;
  baseAmount: number;
  rate: number;
  amount: number;
  reversedAmount: number;
  net: number;
  fundedBy: string;
  ruleSource: string;
  status: string;
  holdUntil: Date | null;
  clearedAt: Date | null;
  reversalReason: string;
  payoutId: string | null;
  createdAt: Date;
}

/** The commission ledger, one row per order line. */
export async function getCommissionRows(
  affiliateId: string,
  query: TableQuery = {},
): Promise<{ rows: CommissionRow[]; total: number }> {
  await clearDueCommissions(affiliateId);
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const status = query.status ?? "all";
  const term = (query.q ?? "").trim();

  const where = {
    affiliateId,
    ...(status !== "all" ? { status } : {}),
    ...(term
      ? {
          OR: [
            { order: { orderNumber: { contains: term.toUpperCase() } } },
            { product: { name: { contains: term, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  try {
    const [total, rows] = await Promise.all([
      prisma.affiliateCommission.count({ where }),
      prisma.affiliateCommission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          orderId: true,
          quantity: true,
          baseAmount: true,
          rate: true,
          amount: true,
          reversedAmount: true,
          fundedBy: true,
          ruleSource: true,
          status: true,
          holdUntil: true,
          clearedAt: true,
          reversalReason: true,
          payoutId: true,
          createdAt: true,
          order: { select: { orderNumber: true } },
          product: { select: { name: true, slug: true } },
        },
      }),
    ]);

    return {
      total,
      rows: rows.map((r) => ({
        id: r.id,
        orderNumber: r.order.orderNumber,
        orderId: r.orderId,
        productName: r.product.name,
        productSlug: r.product.slug,
        quantity: r.quantity,
        baseAmount: money(r.baseAmount),
        rate: r.rate,
        amount: money(r.amount),
        reversedAmount: money(r.reversedAmount),
        net: money(Math.max(0, r.amount - r.reversedAmount)),
        fundedBy: r.fundedBy,
        ruleSource: r.ruleSource,
        status: r.status,
        holdUntil: r.holdUntil,
        clearedAt: r.clearedAt,
        reversalReason: r.reversalReason,
        payoutId: r.payoutId,
        createdAt: r.createdAt,
      })),
    };
  } catch {
    return { rows: [], total: 0 };
  }
}

export interface PayoutRow {
  id: string;
  amount: number;
  status: string;
  method: string;
  accountName: string;
  accountNumber: string;
  network: string;
  reference: string | null;
  note: string | null;
  rejectReason: string;
  createdAt: Date;
  paidAt: Date | null;
  lines: number;
}

export const PAYOUT_STATUS_OPTIONS = [
  { value: "all", label: "All requests" },
  { value: "pending", label: "Awaiting review" },
  { value: "processing", label: "Processing" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Declined" },
];

export async function getAffiliatePayouts(
  affiliateId: string,
  query: TableQuery = {},
): Promise<{ rows: PayoutRow[]; total: number }> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const status = query.status ?? "all";
  const term = (query.q ?? "").trim();

  const where = {
    affiliateId,
    ...(status !== "all" ? { status } : {}),
    ...(term ? { OR: [{ reference: { contains: term } }, { method: { contains: term, mode: "insensitive" as const } }] } : {}),
  };

  try {
    const [total, rows] = await Promise.all([
      prisma.affiliatePayout.count({ where }),
      prisma.affiliatePayout.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          amount: true,
          status: true,
          method: true,
          accountName: true,
          accountNumber: true,
          network: true,
          reference: true,
          note: true,
          rejectReason: true,
          createdAt: true,
          paidAt: true,
          _count: { select: { commissions: true } },
        },
      }),
    ]);
    return {
      total,
      rows: rows.map((r) => ({
        id: r.id,
        amount: money(r.amount),
        status: r.status,
        method: r.method,
        accountName: r.accountName,
        accountNumber: r.accountNumber,
        network: r.network,
        reference: r.reference,
        note: r.note,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
        paidAt: r.paidAt,
        lines: r._count.commissions,
      })),
    };
  } catch {
    return { rows: [], total: 0 };
  }
}

export interface ClickRow {
  id: string;
  createdAt: Date;
  productName: string;
  productSlug: string | null;
  linkCode: string;
  channel: string;
  channelLabel: string;
  path: string;
}

export const CLICK_CHANNEL_OPTIONS = [
  { value: "all", label: "All channels" },
  ...Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label })),
];

export async function getAffiliateClicks(
  affiliateId: string,
  query: TableQuery = {},
): Promise<{ rows: ClickRow[]; total: number }> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const channel = query.status ?? "all";
  const term = (query.q ?? "").trim();

  const where = {
    affiliateId,
    ...(channel !== "all" ? { channel } : {}),
    ...(term ? { linkCode: { contains: term.toUpperCase() } } : {}),
  };

  try {
    const [total, rows] = await Promise.all([
      prisma.affiliateClick.count({ where }),
      prisma.affiliateClick.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        select: { id: true, createdAt: true, productId: true, linkCode: true, channel: true, path: true },
      }),
    ]);

    const ids = [...new Set(rows.map((r) => r.productId).filter(Boolean))] as string[];
    const products = ids.length
      ? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));

    return {
      total,
      rows: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        productName: r.productId ? (byId.get(r.productId)?.name ?? "Removed listing") : "Store-wide link",
        productSlug: r.productId ? (byId.get(r.productId)?.slug ?? null) : null,
        linkCode: r.linkCode,
        channel: r.channel,
        channelLabel: CHANNEL_LABELS[r.channel] ?? (r.channel ? titleCase(r.channel) : "Direct"),
        path: r.path,
      })),
    };
  } catch {
    return { rows: [], total: 0 };
  }
}

/** The affiliate's balance, cleared up to the second. */
export async function getAffiliateBalance(affiliateId: string): Promise<LedgerBalance> {
  return getLedgerBalance(affiliateId);
}

export type { LedgerBalance };

// ---------------------------------------------------------------------------
// The console's guard
// ---------------------------------------------------------------------------

/**
 * Every console screen but the front door starts here.
 *
 * Membership, not role, is what gates this: an affiliate is any signed-in user
 * with an Affiliate row, so somebody can be a customer, a seller, a bundle
 * agent and an affiliate at once. Anyone without one is sent to
 * `/become-an-affiliate`, which is the pitch and the application rather than
 * an error.
 *
 * A suspended affiliate is *not* bounced. They keep the console, because the
 * first thing somebody does when their account goes on hold is go looking for
 * why — and their commission, their payouts and their history are all still
 * theirs. What they lose is attribution on new orders, which the attribution
 * engine enforces and every screen says plainly.
 */
export async function requireAffiliateConsole(): Promise<{
  user: { id: string; name: string | null; email: string | null; role: string };
  affiliate: AffiliateAccount;
  policy: AffiliatePolicy;
}> {
  const user = await requireUser();
  const workspace = await getAffiliateWorkspace({ id: user.id, role: user.role });
  const affiliate = workspace.affiliate;
  if (!affiliate) redirect("/become-an-affiliate");
  return { user, affiliate, policy: workspace.policy };
}
