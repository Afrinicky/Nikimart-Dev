import "server-only";
import { prisma } from "@/lib/prisma";
import { money, resolveCommissionRate } from "@/lib/commission";
import { getCommissionRate } from "@/lib/settings";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { resolveProductRate } from "@/lib/affiliate-policy";
import { clearDueCommissions } from "@/lib/affiliate-ledger";
import type { ModuleTab } from "@/components/admin/ModuleTabs";

/**
 * What the admin's affiliate module reads.
 *
 * Six tables and one policy screen, all shaped like the bundle-orders table
 * they were modelled on: filtered and paged through the query string, counted
 * honestly, and every row leading to the thing it describes.
 *
 * The reads here deliberately mirror the affiliate's own — the same ledger,
 * the same balances, the same eligibility resolution. An admin and an
 * affiliate looking at the same commission must see the same number, which
 * only holds if there is one place that computes it.
 */

export function AFFILIATE_MODULE_TABS(counts: {
  applications?: number;
  payouts?: number;
  flags?: number;
  enquiries?: number;
} = {}): ModuleTab[] {
  return [
    { href: "/admin/affiliates", label: "Affiliates", icon: "users", exact: true },
    {
      href: "/admin/affiliates/applications",
      label: "Applications",
      icon: "inbox",
      badge: counts.applications,
    },
    { href: "/admin/affiliates/products", label: "Product eligibility", icon: "gift" },
    { href: "/admin/affiliates/branding", label: "Branding", icon: "sheet" },
    { href: "/admin/affiliates/commissions", label: "Commissions", icon: "receipt" },
    {
      href: "/admin/affiliates/payouts",
      label: "Payouts",
      icon: "banknote",
      badge: counts.payouts,
    },
    { href: "/admin/affiliates/teams", label: "Teams", icon: "network" },
    { href: "/admin/affiliates/invites", label: "Registration links", icon: "ticket" },
    { href: "/admin/affiliates/chatroom", label: "Chatroom", icon: "message" },
    {
      href: "/admin/affiliates/support",
      label: "Enquiries",
      icon: "lifebuoy",
      badge: counts.enquiries,
    },
    { href: "/admin/affiliates/fraud", label: "Abuse", icon: "audit", badge: counts.flags },
    { href: "/admin/affiliates/settings", label: "Policy", icon: "rules" },
  ];
}

/** The counts the tab row badges. One query each, all in parallel. */
export async function getModuleCounts(): Promise<{
  applications: number;
  payouts: number;
  flags: number;
  enquiries: number;
}> {
  const [applications, payouts, flags, enquiries] = await Promise.all([
    prisma.affiliateApplication.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.affiliatePayout.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.affiliateFraudFlag.count({ where: { status: "open" } }).catch(() => 0),
    prisma.affiliateThread
      .count({ where: { kind: "support", status: { in: ["open", "waiting_support"] } } })
      .catch(() => 0),
  ]);
  return { applications, payouts, flags, enquiries };
}

export interface AdminTableQuery {
  status?: string;
  q?: string;
  page?: number;
  perPage?: number;
}

// ---------------------------------------------------------------------------
// The roster
// ---------------------------------------------------------------------------

export interface AdminAffiliateRow {
  id: string;
  name: string;
  code: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  commissionRate: number | null;
  isUser: boolean;
  createdAt: Date;
  lastSharedAt: Date | null;
  products: number;
  clicks: number;
  orders: number;
  sales: number;
  /** Commission net of reversals. */
  earned: number;
  payable: number;
  paidOut: number;
  openFlags: number;
}

export const AFFILIATE_STATUS_OPTIONS = [
  { value: "all", label: "All affiliates" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Awaiting approval" },
  { value: "suspended", label: "Suspended" },
];

export const AFFILIATE_SOURCE_OPTIONS = [
  { value: "all", label: "Any source" },
  { value: "self", label: "Applied" },
  { value: "seller", label: "Sellers" },
  { value: "agent", label: "Bundle agents" },
  { value: "admin", label: "Added by an admin" },
];

/**
 * The roster.
 *
 * Every figure comes from one grouped query rather than one query per
 * affiliate: the old version computed earnings in a loop, which is fine at
 * twenty affiliates and a page timeout at two thousand.
 */
export async function getAffiliateRoster(
  query: AdminTableQuery & { source?: string } = {},
): Promise<{ rows: AdminAffiliateRow[]; total: number }> {
  await clearDueCommissions();
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const status = query.status ?? "all";
  const source = query.source ?? "all";
  const term = (query.q ?? "").trim();

  const where = {
    ...(status !== "all" ? { status } : {}),
    ...(source !== "all" ? { source } : {}),
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" as const } },
            { code: { contains: term.toUpperCase() } },
            { email: { contains: term, mode: "insensitive" as const } },
            { phone: { contains: term.replace(/\D/g, "") } },
          ],
        }
      : {}),
  };

  try {
    const [total, affiliates] = await Promise.all([
      prisma.affiliate.count({ where }),
      prisma.affiliate.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          name: true,
          code: true,
          email: true,
          phone: true,
          status: true,
          source: true,
          commissionRate: true,
          userId: true,
          createdAt: true,
          lastSharedAt: true,
          _count: { select: { products: true, clicks: true } },
        },
      }),
    ]);

    const ids = affiliates.map((a) => a.id);
    if (ids.length === 0) return { rows: [], total };

    const [commissions, orders, payouts, flags] = await Promise.all([
      prisma.affiliateCommission.groupBy({
        by: ["affiliateId", "status"],
        where: { affiliateId: { in: ids } },
        _sum: { amount: true, reversedAmount: true },
      }),
      prisma.order.groupBy({
        by: ["affiliateId"],
        where: { affiliateId: { in: ids }, status: { not: "pending" } },
        _sum: { subtotal: true },
        _count: { _all: true },
      }),
      prisma.affiliatePayout.groupBy({
        by: ["affiliateId", "status"],
        where: { affiliateId: { in: ids } },
        _sum: { amount: true },
      }),
      prisma.affiliateFraudFlag.groupBy({
        by: ["affiliateId"],
        where: { affiliateId: { in: ids }, status: "open" },
        _count: { _all: true },
      }),
    ]);

    const earnedBy = new Map<string, number>();
    const payableBy = new Map<string, number>();
    for (const row of commissions) {
      const net = Math.max(0, (row._sum.amount ?? 0) - (row._sum.reversedAmount ?? 0));
      earnedBy.set(row.affiliateId, (earnedBy.get(row.affiliateId) ?? 0) + net);
      if (row.status === "cleared") {
        payableBy.set(row.affiliateId, (payableBy.get(row.affiliateId) ?? 0) + net);
      }
    }
    const orderStats = new Map(orders.map((o) => [o.affiliateId ?? "", o]));
    const paidBy = new Map<string, number>();
    for (const row of payouts) {
      if (row.status !== "paid") continue;
      paidBy.set(row.affiliateId, (paidBy.get(row.affiliateId) ?? 0) + (row._sum.amount ?? 0));
    }
    const flagsBy = new Map(flags.map((f) => [f.affiliateId, f._count._all]));

    return {
      total,
      rows: affiliates.map((a) => ({
        id: a.id,
        name: a.name,
        code: a.code ?? "",
        email: a.email,
        phone: a.phone,
        status: a.status,
        source: a.source,
        commissionRate: a.commissionRate,
        isUser: Boolean(a.userId),
        createdAt: a.createdAt,
        lastSharedAt: a.lastSharedAt,
        products: a._count.products,
        clicks: a._count.clicks,
        orders: orderStats.get(a.id)?._count._all ?? 0,
        sales: money(orderStats.get(a.id)?._sum.subtotal ?? 0),
        earned: money(earnedBy.get(a.id) ?? 0),
        payable: money(payableBy.get(a.id) ?? 0),
        paidOut: money(paidBy.get(a.id) ?? 0),
        openFlags: flagsBy.get(a.id) ?? 0,
      })),
    };
  } catch {
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export interface AdminApplicationRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  channels: string[];
  audience: string;
  note: string;
  desiredCode: string;
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
  decisionNote: string;
  /** What else they already are on Nickimart — the thing that decides it. */
  isSeller: boolean;
  /** Orders they have placed as a customer. A real shopper is a good sign. */
  ordersPlaced: number;
}

export const APPLICATION_STATUS_OPTIONS = [
  { value: "pending", label: "Awaiting a decision" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Declined" },
  { value: "all", label: "Everything" },
];

export async function getApplications(
  query: AdminTableQuery = {},
): Promise<{ rows: AdminApplicationRow[]; total: number }> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const status = query.status ?? "pending";
  const term = (query.q ?? "").trim();

  const where = {
    ...(status !== "all" ? { status } : {}),
    ...(term
      ? {
          OR: [
            { fullName: { contains: term, mode: "insensitive" as const } },
            { email: { contains: term, mode: "insensitive" as const } },
            { phone: { contains: term.replace(/\D/g, "") } },
          ],
        }
      : {}),
  };

  try {
    const [total, rows] = await Promise.all([
      prisma.affiliateApplication.count({ where }),
      prisma.affiliateApplication.findMany({
        where,
        orderBy: status === "pending" ? { createdAt: "asc" } : { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    const userIds = rows.map((r) => r.userId).filter(Boolean) as string[];
    const [vendors, orderCounts] = await Promise.all([
      userIds.length
        ? prisma.vendor.findMany({ where: { ownerId: { in: userIds } }, select: { ownerId: true } })
        : Promise.resolve([] as { ownerId: string | null }[]),
      userIds.length
        ? prisma.order.groupBy({
            by: ["userId"],
            where: { userId: { in: userIds }, status: { not: "pending" } },
            _count: { _all: true },
          })
        : Promise.resolve([] as { userId: string; _count: { _all: number } }[]),
    ]);
    const sellers = new Set(vendors.map((v) => v.ownerId));
    const placed = new Map(orderCounts.map((o) => [o.userId, o._count._all]));

    return {
      total,
      rows: rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        channels: parseChannels(r.channels),
        audience: r.audience,
        note: r.note,
        desiredCode: r.desiredCode,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        decisionNote: r.decisionNote,
        isSeller: r.userId ? sellers.has(r.userId) : false,
        ordersPlaced: r.userId ? (placed.get(r.userId) ?? 0) : 0,
      })),
    };
  } catch {
    return { rows: [], total: 0 };
  }
}

function parseChannels(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Product eligibility
// ---------------------------------------------------------------------------

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  emoji: string;
  shopName: string;
  categoryName: string;
  price: number;
  enabled: boolean;
  enrolledBy: string;
  /** The rate typed onto the product, if any. */
  ownRate: number | null;
  /** What it actually pays, after the funding caps. */
  rate: number;
  earnPerSale: number;
  fundedBy: string;
  /** The highest rate the platform would fund on it. */
  platformCeiling: number;
  platformCommissionRate: number;
  /** How many affiliates are promoting it. */
  promoters: number;
  /** Commission it has paid out, net of reversals. */
  commission: number;
}

export const PRODUCT_ELIGIBILITY_OPTIONS = [
  { value: "all", label: "All products" },
  { value: "enrolled", label: "In the programme" },
  { value: "seller", label: "Seller-funded" },
  { value: "platform", label: "Nickimart-funded" },
  { value: "out", label: "Not enrolled" },
  { value: "promoted", label: "Being promoted" },
];

/**
 * Every listing and where it stands in the programme.
 *
 * This is the screen an admin uses to put commission on things, so it shows
 * the two numbers that decide it: what the platform earns on the item, and the
 * most it would fund out of that. Enrolling a product at Nickimart's expense
 * is capped at half the platform's own commission, and an admin should be able
 * to see that ceiling rather than discover it by being refused.
 */
export async function getProductEligibility(
  query: AdminTableQuery & { category?: string } = {},
): Promise<{ rows: AdminProductRow[]; total: number; enrolled: number }> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const mode = query.status ?? "all";
  const term = (query.q ?? "").trim();

  const [products, defaultCommission, policy, promoters, commissions] = await Promise.all([
    prisma.product.findMany({
      where: {
        isArchived: false,
        ...(term ? { name: { contains: term, mode: "insensitive" } } : {}),
        ...(query.category && query.category !== "all"
          ? { category: { slug: query.category } }
          : {}),
      },
      orderBy: [{ affiliateEnabled: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        image: true,
        emoji: true,
        price: true,
        affiliateEnabled: true,
        affiliateEnrolledBy: true,
        affiliateCommissionRate: true,
        category: { select: { name: true, commissionRate: true, affiliateCommissionRate: true } },
        vendor: { select: { businessName: true } },
        images: { orderBy: { order: "asc" }, take: 1, select: { url: true } },
      },
    }),
    getCommissionRate(),
    getAffiliatePolicy(),
    prisma.affiliateProduct
      .groupBy({ by: ["productId"], _count: { _all: true } })
      .catch(() => [] as { productId: string; _count: { _all: number } }[]),
    prisma.affiliateCommission
      .groupBy({ by: ["productId"], _sum: { amount: true, reversedAmount: true } })
      .catch(() => [] as { productId: string; _sum: { amount: number | null; reversedAmount: number | null } }[]),
  ]);

  const promoterBy = new Map(promoters.map((p) => [p.productId, p._count._all]));
  const commissionBy = new Map(
    commissions.map((c) => [
      c.productId,
      Math.max(0, (c._sum.amount ?? 0) - (c._sum.reversedAmount ?? 0)),
    ]),
  );

  const mapped: AdminProductRow[] = products.map((p) => {
    const platformCommissionRate = resolveCommissionRate(
      p.category?.commissionRate,
      defaultCommission,
    );
    const resolved = resolveProductRate({
      affiliateEnabled: p.affiliateEnabled,
      affiliateEnrolledBy: p.affiliateEnrolledBy,
      affiliateCommissionRate: p.affiliateCommissionRate,
      categoryAffiliateRate: p.category?.affiliateCommissionRate,
      defaultAffiliateRate: policy.defaultRate,
      platformCommissionRate,
    });
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      image: p.images[0]?.url ?? p.image ?? null,
      emoji: p.emoji,
      shopName: p.vendor?.businessName ?? "—",
      categoryName: p.category?.name ?? "—",
      price: p.price,
      enabled: p.affiliateEnabled,
      enrolledBy: p.affiliateEnrolledBy,
      ownRate: p.affiliateCommissionRate,
      rate: resolved.rate,
      earnPerSale: money((p.price * resolved.rate) / 100),
      fundedBy: resolved.fundedBy,
      platformCeiling: Math.round(platformCommissionRate * 50) / 100,
      platformCommissionRate,
      promoters: promoterBy.get(p.id) ?? 0,
      commission: money(commissionBy.get(p.id) ?? 0),
    };
  });

  const enrolled = mapped.filter((p) => p.enabled && p.rate > 0).length;

  const filtered = mapped.filter((p) => {
    switch (mode) {
      case "enrolled":
        return p.enabled;
      case "seller":
        return p.enabled && p.enrolledBy === "seller";
      case "platform":
        return p.enabled && p.enrolledBy === "admin";
      case "out":
        return !p.enabled;
      case "promoted":
        return p.promoters > 0;
      default:
        return true;
    }
  });

  const start = (page - 1) * perPage;
  return { rows: filtered.slice(start, start + perPage), total: filtered.length, enrolled };
}

// ---------------------------------------------------------------------------
// The commission monitor
// ---------------------------------------------------------------------------

export interface AdminCommissionRow {
  id: string;
  affiliateId: string;
  affiliateName: string;
  affiliateCode: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  productName: string;
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
  reversalReason: string;
  payoutId: string | null;
  createdAt: Date;
}

export async function getAdminCommissions(
  query: AdminTableQuery = {},
): Promise<{
  rows: AdminCommissionRow[];
  total: number;
  totals: { earned: number; pending: number; clearing: number; cleared: number; paid: number; reversed: number };
}> {
  await clearDueCommissions();
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const status = query.status ?? "all";
  const term = (query.q ?? "").trim();

  const where = {
    ...(status !== "all" ? { status } : {}),
    ...(term
      ? {
          OR: [
            { order: { orderNumber: { contains: term.toUpperCase() } } },
            { product: { name: { contains: term, mode: "insensitive" as const } } },
            { affiliate: { name: { contains: term, mode: "insensitive" as const } } },
            { affiliate: { code: { contains: term.toUpperCase() } } },
          ],
        }
      : {}),
  };

  const empty = { earned: 0, pending: 0, clearing: 0, cleared: 0, paid: 0, reversed: 0 };

  try {
    const [total, rows, grouped] = await Promise.all([
      prisma.affiliateCommission.count({ where }),
      prisma.affiliateCommission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          affiliateId: true,
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
          reversalReason: true,
          payoutId: true,
          createdAt: true,
          affiliate: { select: { name: true, code: true } },
          order: { select: { orderNumber: true, status: true } },
          product: { select: { name: true } },
        },
      }),
      prisma.affiliateCommission.groupBy({
        by: ["status"],
        _sum: { amount: true, reversedAmount: true },
      }),
    ]);

    const totals = { ...empty };
    for (const row of grouped) {
      const net = Math.max(0, (row._sum.amount ?? 0) - (row._sum.reversedAmount ?? 0));
      totals.reversed = money(totals.reversed + (row._sum.reversedAmount ?? 0));
      if (row.status in totals) {
        totals[row.status as keyof typeof totals] = money(
          totals[row.status as keyof typeof totals] + net,
        );
      }
      if (row.status !== "reversed") totals.earned = money(totals.earned + net);
    }

    return {
      total,
      totals,
      rows: rows.map((r) => ({
        id: r.id,
        affiliateId: r.affiliateId,
        affiliateName: r.affiliate.name,
        affiliateCode: r.affiliate.code ?? "",
        orderId: r.orderId,
        orderNumber: r.order.orderNumber,
        orderStatus: r.order.status,
        productName: r.product.name,
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
        reversalReason: r.reversalReason,
        payoutId: r.payoutId,
        createdAt: r.createdAt,
      })),
    };
  } catch {
    return { rows: [], total: 0, totals: empty };
  }
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export interface AdminPayoutRow {
  id: string;
  affiliateId: string;
  affiliateName: string;
  affiliateCode: string;
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
  /** What this affiliate has cleared and not yet been paid. */
  payable: number;
}

export async function getAdminPayouts(
  query: AdminTableQuery = {},
): Promise<{ rows: AdminPayoutRow[]; total: number; owed: number; awaiting: number }> {
  await clearDueCommissions();
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const status = query.status ?? "all";
  const term = (query.q ?? "").trim();

  const where = {
    ...(status !== "all" ? { status } : {}),
    ...(term
      ? {
          OR: [
            { affiliate: { name: { contains: term, mode: "insensitive" as const } } },
            { affiliate: { code: { contains: term.toUpperCase() } } },
            { reference: { contains: term } },
          ],
        }
      : {}),
  };

  try {
    const [total, rows, awaiting, cleared] = await Promise.all([
      prisma.affiliatePayout.count({ where }),
      prisma.affiliatePayout.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          affiliateId: true,
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
          affiliate: { select: { name: true, code: true } },
          _count: { select: { commissions: true } },
        },
      }),
      prisma.affiliatePayout.aggregate({
        where: { status: { in: ["pending", "processing"] } },
        _sum: { amount: true },
      }),
      prisma.affiliateCommission.groupBy({
        by: ["affiliateId"],
        where: { status: "cleared" },
        _sum: { amount: true, reversedAmount: true },
      }),
    ]);

    const payableBy = new Map(
      cleared.map((c) => [
        c.affiliateId,
        Math.max(0, (c._sum.amount ?? 0) - (c._sum.reversedAmount ?? 0)),
      ]),
    );

    return {
      total,
      awaiting: money(awaiting._sum.amount ?? 0),
      owed: money([...payableBy.values()].reduce((s, v) => s + v, 0)),
      rows: rows.map((r) => ({
        id: r.id,
        affiliateId: r.affiliateId,
        affiliateName: r.affiliate.name,
        affiliateCode: r.affiliate.code ?? "",
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
        payable: money(payableBy.get(r.affiliateId) ?? 0),
      })),
    };
  } catch {
    return { rows: [], total: 0, owed: 0, awaiting: 0 };
  }
}

// ---------------------------------------------------------------------------
// Abuse
// ---------------------------------------------------------------------------

export interface AdminFlagRow {
  id: string;
  affiliateId: string;
  affiliateName: string;
  affiliateCode: string;
  orderId: string | null;
  orderNumber: string | null;
  kind: string;
  severity: string;
  detail: string;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

export const FLAG_STATUS_OPTIONS = [
  { value: "open", label: "Needs a look" },
  { value: "upheld", label: "Upheld" },
  { value: "cleared", label: "Cleared" },
  { value: "all", label: "Everything" },
];

export const FLAG_KIND_LABELS: Record<string, string> = {
  self_referral: "Bought through their own link",
  same_account: "Buyer's details match the affiliate's",
  same_device: "Same device as the affiliate",
  same_ip: "Same address as the affiliate",
  velocity: "Unusual number of orders",
  expired_window: "Referral window had closed",
  suspended: "Account was on hold",
  duplicate_payment: "Duplicate payment notification",
  rate_anomaly: "Commission rate looks wrong",
};

export async function getFraudFlags(
  query: AdminTableQuery = {},
): Promise<{ rows: AdminFlagRow[]; total: number; open: number }> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 25;
  const status = query.status ?? "open";
  const term = (query.q ?? "").trim();

  const where = {
    ...(status !== "all" ? { status } : {}),
    ...(term
      ? {
          OR: [
            { affiliate: { name: { contains: term, mode: "insensitive" as const } } },
            { affiliate: { code: { contains: term.toUpperCase() } } },
            { kind: { contains: term } },
          ],
        }
      : {}),
  };

  try {
    const [total, rows, open] = await Promise.all([
      prisma.affiliateFraudFlag.count({ where }),
      prisma.affiliateFraudFlag.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          affiliateId: true,
          orderId: true,
          kind: true,
          severity: true,
          detail: true,
          status: true,
          createdAt: true,
          resolvedAt: true,
          affiliate: { select: { name: true, code: true } },
        },
      }),
      prisma.affiliateFraudFlag.count({ where: { status: "open" } }),
    ]);

    const orderIds = rows.map((r) => r.orderId).filter(Boolean) as string[];
    const orders = orderIds.length
      ? await prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, orderNumber: true },
        })
      : [];
    const numbers = new Map(orders.map((o) => [o.id, o.orderNumber]));

    return {
      total,
      open,
      rows: rows.map((r) => ({
        id: r.id,
        affiliateId: r.affiliateId,
        affiliateName: r.affiliate.name,
        affiliateCode: r.affiliate.code ?? "",
        orderId: r.orderId,
        orderNumber: r.orderId ? (numbers.get(r.orderId) ?? null) : null,
        kind: r.kind,
        severity: r.severity,
        detail: r.detail,
        status: r.status,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
      })),
    };
  } catch {
    return { rows: [], total: 0, open: 0 };
  }
}

/** The audit trail for one affiliate, or for the whole programme. */
export async function getAffiliateEvents(affiliateId?: string, take = 50) {
  return prisma.affiliateEvent
    .findMany({
      where: affiliateId ? { affiliateId } : {},
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        action: true,
        detail: true,
        actorId: true,
        actorName: true,
        createdAt: true,
        affiliate: { select: { name: true } },
      },
    })
    .catch(() => []);
}

export const EVENT_LABELS: Record<string, string> = {
  affiliate_created: "Affiliate created",
  application_submitted: "Application submitted",
  application_approved: "Application approved",
  application_rejected: "Application declined",
  status_changed: "Status changed",
  rate_changed: "Commission rate changed",
  product_added: "Product added to a list",
  product_removed: "Product removed from a list",
  product_enrolled: "Product enrolled",
  product_withdrawn: "Product withdrawn",
  profile_updated: "Details updated",
  code_changed: "Referral code changed",
  payout_requested: "Payout requested",
  payout_paid: "Payout paid",
  payout_rejected: "Payout declined",
  payout_withdrawn: "Payout request withdrawn",
  commission_reversed: "Commission reversed",
  commission_released: "Reversal undone",
  flag_resolved: "Abuse flag resolved",
};
