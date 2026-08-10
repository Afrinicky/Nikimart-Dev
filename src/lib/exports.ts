import "server-only";
import { prisma } from "@/lib/prisma";
import type { Sheet } from "@/lib/xlsx";
import {
  lineCommission,
  money,
  platformAffiliateCost,
  resolveCommissionRate,
  sellerAffiliateCost,
} from "@/lib/commission";
import { resolveAffiliateRate } from "@/lib/affiliate-commission";
import { getAffiliateRate, getCommissionRate, getSettings } from "@/lib/settings";
import { getAffiliateEarnings } from "@/lib/affiliate";
import { getSellerEarnings } from "@/lib/seller";
import { getFinanceOverview, getVendorSettlements } from "@/lib/finance";
import { getAllLocations } from "@/lib/locations";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { ROLE_LABELS, isRole } from "@/lib/roles";

/**
 * Workbook builders behind Admin → Export.
 *
 * Each dataset mirrors what its console tab is *about*, not just the columns
 * that happen to fit on screen: the products sheet carries dimensions and
 * affiliate enrolment, the orders workbook carries a line-item sheet, and the
 * finance workbook carries the ledgers behind each headline number. The point
 * is that the export answers questions the table can't.
 */

export const EXPORT_DATASETS = [
  "products",
  "shops",
  "categories",
  "users",
  "orders",
  "finance",
  "affiliates",
  "locations",
  "pickup",
  "shipping",
] as const;

export type ExportDataset = (typeof EXPORT_DATASETS)[number];

export function isExportDataset(value: string): value is ExportDataset {
  return (EXPORT_DATASETS as readonly string[]).includes(value);
}

const yesNo = (value: boolean) => (value ? "Yes" : "No");
const parseList = (json: string): string => {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.join(", ") : "";
  } catch {
    return "";
  }
};
const fundedByLabel = (value: string) =>
  value === "platform" ? "NikiMart" : value === "seller" ? "Seller" : "—";

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

async function productsWorkbook(): Promise<Sheet[]> {
  const [products, defaultCommission, defaultAffiliateRate] = await Promise.all([
    prisma.product.findMany({
      orderBy: { name: "asc" },
      include: {
        category: { select: { name: true, commissionRate: true, affiliateCommissionRate: true } },
        vendor: { select: { businessName: true, originCountry: true } },
        _count: { select: { images: true, orderItems: true } },
      },
    }),
    getCommissionRate(),
    getAffiliateRate(),
  ]);

  // Units sold and revenue per product, excluding cancelled and unpaid orders.
  const sales = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { order: { status: { notIn: ["cancelled", "pending"] } } },
    _sum: { quantity: true },
  });
  const soldByProduct = new Map(sales.map((s) => [s.productId, s._sum.quantity ?? 0]));

  return [
    {
      name: "Products",
      columns: [
        "Name", "Slug", "Category", "Shop", "Origin", "Type", "Price (GH₵)", "Old price (GH₵)",
        "Stock", "Units sold", "Status", "Featured", "Official", "Commission %",
        "Affiliate enrolled", "Enrolled by", "Affiliate rate %", "Affiliate earns (GH₵)",
        "Weight (kg)", "Length (cm)", "Width (cm)", "Height (cm)", "CBM",
        "Pickup", "Campus delivery", "Same-day", "Rating", "Reviews", "Images", "Badges", "Locations",
      ],
      rows: products.map((p) => {
        const commissionRate = resolveCommissionRate(p.category?.commissionRate, defaultCommission);
        const affiliate = resolveAffiliateRate({
          affiliateEnabled: p.affiliateEnabled,
          affiliateEnrolledBy: p.affiliateEnrolledBy,
          affiliateCommissionRate: p.affiliateCommissionRate,
          categoryAffiliateRate: p.category?.affiliateCommissionRate,
          defaultAffiliateRate,
          platformCommissionRate: commissionRate,
        });
        return [
          p.name, p.slug, p.category?.name ?? "—", p.vendor?.businessName ?? "—",
          p.vendor?.originCountry ?? "GH", p.productType, p.price, p.oldPrice ?? null,
          p.stockQuantity, soldByProduct.get(p.id) ?? 0,
          p.isArchived ? "Archived" : "Live",
          yesNo(p.isFeatured), yesNo(p.isOfficial), commissionRate,
          yesNo(p.affiliateEnabled), fundedByLabel(affiliate.fundedBy),
          affiliate.rate, money((p.price * affiliate.rate) / 100),
          p.shippingWeightKg, p.lengthCm, p.widthCm, p.heightCm, p.cbm,
          yesNo(p.pickupAvailable), yesNo(p.campusDeliveryAvailable), yesNo(p.sameDayDeliveryAvailable),
          p.rating, p.reviewCount, p._count.images, parseList(p.badges), parseList(p.locationIds),
        ];
      }),
    },
  ];
}

// ---------------------------------------------------------------------------
// Shops (vendors)
// ---------------------------------------------------------------------------

async function shopsWorkbook(): Promise<Sheet[]> {
  const vendors = await prisma.vendor.findMany({
    orderBy: { businessName: "asc" },
    include: {
      owner: { select: { name: true, email: true, phone: true } },
      originPickup: { select: { name: true, locationName: true } },
      _count: { select: { products: true } },
    },
  });

  const earnings = await Promise.all(vendors.map((v) => getSellerEarnings(v.id)));

  return [
    {
      name: "Shops",
      columns: [
        "Shop", "Slug", "Owner", "Owner email", "Owner phone", "Seller types", "Verification",
        "Origin country", "Origin hub", "Products", "Rating", "Reviews",
        "Gross sales (GH₵)", "Platform commission (GH₵)", "Affiliate commission (GH₵)",
        "Net earned (GH₵)", "In escrow (GH₵)", "Cleared (GH₵)", "Paid out (GH₵)",
        "Pending payouts (GH₵)", "Available (GH₵)",
        "Payout method", "MoMo number", "MoMo name", "Bank", "Account number", "Account name",
        "Delivery", "Pickup", "Same-day", "Official",
      ],
      rows: vendors.map((v, i) => {
        const e = earnings[i];
        return [
          v.businessName, v.slug, v.owner?.name ?? "—", v.owner?.email ?? "—", v.owner?.phone ?? "—",
          parseList(v.sellerTypes), v.verificationStatus, v.originCountry,
          v.originPickup ? `${v.originPickup.name} — ${v.originPickup.locationName}` : "—",
          v._count.products, v.rating, v.reviewCount,
          e.gross, e.commission, e.affiliateCost, e.net, e.inEscrow, e.cleared, e.paidOut,
          e.pendingPayouts, e.available,
          v.payoutMethod || "—", v.momoNumber, v.momoName, v.bankName, v.bankAccountNumber,
          v.bankAccountName,
          yesNo(v.deliveryAvailable), yesNo(v.pickupAvailable), yesNo(v.sameDayDeliveryAvailable),
          yesNo(v.isOfficial),
        ];
      }),
    },
  ];
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

async function categoriesWorkbook(): Promise<Sheet[]> {
  const [categories, defaultCommission, defaultAffiliateRate] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    }),
    getCommissionRate(),
    getAffiliateRate(),
  ]);

  const enrolled = await prisma.product.groupBy({
    by: ["categoryId"],
    where: { affiliateEnabled: true, isArchived: false },
    _count: { _all: true },
  });
  const enrolledByCategory = new Map(enrolled.map((e) => [e.categoryId, e._count._all]));

  return [
    {
      name: "Categories",
      columns: [
        "Name", "Slug", "Description", "Icon", "Products", "Affiliate-enrolled products",
        "Commission override %", "Effective commission %", "Affiliate rate override %",
        "Effective affiliate rate %", "Display count",
      ],
      rows: categories.map((c) => [
        c.name, c.slug, c.description, c.icon, c._count.products,
        enrolledByCategory.get(c.id) ?? 0,
        c.commissionRate ?? null,
        resolveCommissionRate(c.commissionRate, defaultCommission),
        c.affiliateCommissionRate ?? null,
        c.affiliateCommissionRate ?? defaultAffiliateRate,
        c.productCount,
      ]),
    },
  ];
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function usersWorkbook(): Promise<Sheet[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      vendor: { select: { businessName: true, verificationStatus: true } },
      affiliate: { select: { code: true, status: true } },
      preferredPickup: { select: { name: true, locationName: true } },
      pickupPoint: { select: { name: true } },
    },
  });

  // Lifetime spend per customer, excluding cancelled and unpaid orders.
  const spend = await prisma.order.groupBy({
    by: ["userId"],
    where: { status: { notIn: ["cancelled", "pending"] } },
    _sum: { total: true },
    _count: { _all: true },
  });
  const spendByUser = new Map(spend.map((s) => [s.userId, s]));

  return [
    {
      name: "Users",
      columns: [
        "Name", "Email", "Phone", "Role", "Registered", "Orders", "Lifetime spend (GH₵)",
        "Shop", "Shop verification", "Affiliate code", "Affiliate status",
        "Operates pickup point", "Preferred pickup", "Address",
      ],
      rows: users.map((u) => {
        const s = spendByUser.get(u.id);
        return [
          u.name ?? "—", u.email, u.phone ?? "—",
          isRole(u.role) ? ROLE_LABELS[u.role] : u.role,
          u.createdAt, s?._count._all ?? 0, money(s?._sum.total ?? 0),
          u.vendor?.businessName ?? "—", u.vendor?.verificationStatus ?? "—",
          u.affiliate?.code ?? "—", u.affiliate?.status ?? "—",
          u.pickupPoint?.name ?? "—",
          u.preferredPickup ? `${u.preferredPickup.name} — ${u.preferredPickup.locationName}` : "—",
          u.address ?? "—",
        ];
      }),
    },
  ];
}

// ---------------------------------------------------------------------------
// Orders — header sheet plus the line items behind them
// ---------------------------------------------------------------------------

async function ordersWorkbook(): Promise<Sheet[]> {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      pickupPoint: { select: { name: true, locationName: true, code: true } },
      affiliate: { select: { name: true, code: true } },
      shipment: { select: { trackingNumber: true, status: true, eta: true, deliveredAt: true } },
      items: {
        include: {
          product: { select: { name: true, slug: true, vendor: { select: { businessName: true } } } },
        },
      },
    },
  });

  const orderSheet: Sheet = {
    name: "Orders",
    columns: [
      "Order", "Placed", "Status", "Customer", "Email", "Phone", "Items", "Units",
      "Subtotal (GH₵)", "Delivery (GH₵)", "Total (GH₵)",
      "Platform commission (GH₵)", "Affiliate commission (GH₵)", "Affiliate", "Affiliate code",
      "Delivery method", "Pickup point", "Pickup code",
      "Tracking number", "Shipment status", "ETA", "Delivered",
    ],
    rows: orders.map((o) => [
      o.orderNumber, o.createdAt, ORDER_STATUS_LABELS[o.status] ?? o.status,
      o.user.name ?? "—", o.user.email, o.user.phone ?? "—",
      o.items.length, o.items.reduce((s, i) => s + i.quantity, 0),
      o.subtotal, o.deliveryFee, o.total,
      money(o.items.reduce((s, i) => s + lineCommission(i), 0)),
      o.affiliateCommission, o.affiliate?.name ?? "—", o.affiliate?.code ?? "—",
      o.deliveryMethod,
      o.pickupPoint ? `${o.pickupPoint.name} — ${o.pickupPoint.locationName}` : "—",
      o.pickupPoint?.code ?? "—",
      o.shipment?.trackingNumber ?? "—", o.shipment?.status ?? "—",
      o.shipment?.eta ?? null, o.shipment?.deliveredAt ?? null,
    ]),
  };

  const itemSheet: Sheet = {
    name: "Order items",
    columns: [
      "Order", "Placed", "Order status", "Product", "Slug", "Shop", "Quantity",
      "Unit price (GH₵)", "Line total (GH₵)", "Commission %", "Commission (GH₵)",
      "Seller net (GH₵)", "Affiliate rate %", "Affiliate commission (GH₵)", "Affiliate funded by",
    ],
    rows: orders.flatMap((o) =>
      o.items.map((i) => {
        const gross = i.unitPrice * i.quantity;
        return [
          o.orderNumber, o.createdAt, ORDER_STATUS_LABELS[o.status] ?? o.status,
          i.product.name, i.product.slug, i.product.vendor?.businessName ?? "—",
          i.quantity, i.unitPrice, money(gross), i.commissionRate, money(lineCommission(i)),
          money(gross - lineCommission(i) - sellerAffiliateCost(i)),
          i.affiliateCommissionRate, i.affiliateCommission, fundedByLabel(i.affiliateFundedBy),
        ];
      }),
    ),
  };

  return [orderSheet, itemSheet];
}

// ---------------------------------------------------------------------------
// Finance — the ledgers behind every headline figure
// ---------------------------------------------------------------------------

async function financeWorkbook(): Promise<Sheet[]> {
  const [overview, settlements, sellerPayouts, affiliatePayouts, items, defaultCommission] =
    await Promise.all([
      getFinanceOverview(),
      getVendorSettlements(),
      prisma.payout.findMany({
        orderBy: { createdAt: "desc" },
        include: { vendor: { select: { businessName: true } } },
      }),
      prisma.affiliatePayout.findMany({
        orderBy: { createdAt: "desc" },
        include: { affiliate: { select: { name: true, code: true } } },
      }),
      prisma.orderItem.findMany({
        where: { order: { status: { notIn: ["cancelled", "pending"] } } },
        include: {
          product: { select: { name: true, vendor: { select: { businessName: true } } } },
          order: {
            select: {
              orderNumber: true,
              createdAt: true,
              status: true,
              affiliate: { select: { name: true, code: true } },
            },
          },
        },
      }),
      getCommissionRate(),
    ]);

  const summary: Sheet = {
    name: "Summary",
    columns: ["Metric", "Amount (GH₵)", "Notes"],
    rows: [
      ["Gross merchandise value", overview.gmv, "Paid order totals, including delivery"],
      ["Platform commission (gross)", overview.commission, `Default rate ${defaultCommission}%`],
      ["Affiliate commission accrued", overview.affiliateAccrued, "All referred sales"],
      ["  — funded by NikiMart", overview.affiliateFundedByPlatform, "Products NikiMart enrolled"],
      ["  — funded by sellers", overview.affiliateFundedBySellers, "Products sellers enrolled"],
      ["Platform earnings (net)", overview.platformEarnings, "Commission less NikiMart-funded affiliate cost"],
      ["Delivery collected", overview.delivery, "Pass-through to freight"],
      ["Owed to sellers", overview.owedToSellers, "Cleared, awaiting payout"],
      ["In escrow", overview.inEscrow, "Paid but not yet delivered"],
      ["Paid to sellers", overview.sellerPaidOut, "Completed settlements"],
      ["Seller payouts pending", overview.sellerPending, "Requested, awaiting review"],
      ["Paid to affiliates", overview.affiliatePaid, "Completed affiliate payments"],
    ],
  };

  const settlementSheet: Sheet = {
    name: "Seller settlements",
    columns: [
      "Seller", "Gross (GH₵)", "Commission (GH₵)", "Affiliate cost (GH₵)", "Net (GH₵)",
      "In escrow (GH₵)", "Cleared (GH₵)", "Paid out (GH₵)", "Pending (GH₵)", "Available (GH₵)",
    ],
    rows: settlements.map((s) => [
      s.businessName, s.earnings.gross, s.earnings.commission, s.earnings.affiliateCost,
      s.earnings.net, s.earnings.inEscrow, s.earnings.cleared, s.earnings.paidOut,
      s.earnings.pendingPayouts, s.earnings.available,
    ]),
  };

  const sellerPayoutSheet: Sheet = {
    name: "Seller payouts",
    columns: ["Seller", "Amount (GH₵)", "Status", "Method", "Reference", "Requested", "Paid", "Note"],
    rows: sellerPayouts.map((p) => [
      p.vendor.businessName, p.amount, p.status, p.method || "—", p.reference ?? "—",
      p.createdAt, p.paidAt ?? null, p.note ?? "—",
    ]),
  };

  const affiliatePayoutSheet: Sheet = {
    name: "Affiliate payouts",
    columns: ["Affiliate", "Code", "Amount (GH₵)", "Status", "Method", "Reference", "Requested", "Paid", "Note"],
    rows: affiliatePayouts.map((p) => [
      p.affiliate.name, p.affiliate.code ?? "—", p.amount, p.status, p.method || "—",
      p.reference ?? "—", p.createdAt, p.paidAt ?? null, p.note ?? "—",
    ]),
  };

  const ledger: Sheet = {
    name: "Commission ledger",
    columns: [
      "Order", "Placed", "Order status", "Product", "Shop", "Quantity", "Gross (GH₵)",
      "Commission %", "Commission (GH₵)", "Affiliate (GH₵)", "Affiliate funded by",
      "Referred by", "Platform net (GH₵)", "Seller net (GH₵)",
    ],
    rows: items.map((i) => {
      const gross = i.unitPrice * i.quantity;
      const commission = lineCommission(i);
      return [
        i.order.orderNumber, i.order.createdAt, ORDER_STATUS_LABELS[i.order.status] ?? i.order.status,
        i.product.name, i.product.vendor?.businessName ?? "—", i.quantity, money(gross),
        i.commissionRate, money(commission), i.affiliateCommission,
        fundedByLabel(i.affiliateFundedBy),
        i.order.affiliate ? `${i.order.affiliate.name} (${i.order.affiliate.code ?? "—"})` : "—",
        money(commission - platformAffiliateCost(i)),
        money(gross - commission - sellerAffiliateCost(i)),
      ];
    }),
  };

  return [summary, settlementSheet, sellerPayoutSheet, affiliatePayoutSheet, ledger];
}

// ---------------------------------------------------------------------------
// Affiliates
// ---------------------------------------------------------------------------

async function affiliatesWorkbook(): Promise<Sheet[]> {
  const affiliates = await prisma.affiliate.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true, phone: true } } },
  });

  const earnings = await Promise.all(affiliates.map((a) => getAffiliateEarnings(a.id)));

  const roster: Sheet = {
    name: "Affiliates",
    columns: [
      "Name", "Code", "Status", "Email", "Phone", "Linked account", "Joined",
      "Rate override %", "Referred orders", "Earned (GH₵)", "Awaiting delivery (GH₵)",
      "Cleared (GH₵)", "Paid out (GH₵)", "Pending payouts (GH₵)", "Available (GH₵)", "Note",
    ],
    rows: affiliates.map((a, i) => {
      const e = earnings[i];
      return [
        a.name, a.code ?? "—", a.status, a.email || a.user?.email || "—",
        a.phone || a.user?.phone || "—", a.user ? (a.user.name ?? a.user.email) : "Admin-created",
        a.createdAt, a.commissionRate ?? null, e.referredOrders, e.earned, e.inEscrow,
        e.cleared, e.paidOut, e.pendingPayouts, e.available, a.note || "—",
      ];
    }),
  };

  const referredOrders = await prisma.order.findMany({
    where: { affiliateId: { not: null } },
    orderBy: { createdAt: "desc" },
    include: {
      affiliate: { select: { name: true, code: true } },
      user: { select: { name: true, email: true } },
      items: {
        where: { affiliateCommission: { gt: 0 } },
        include: { product: { select: { name: true } } },
      },
    },
  });

  const referrals: Sheet = {
    name: "Referred orders",
    columns: [
      "Affiliate", "Code", "Order", "Placed", "Status", "Customer", "Order total (GH₵)",
      "Commission (GH₵)", "Earning products",
    ],
    rows: referredOrders.map((o) => [
      o.affiliate?.name ?? "—", o.affiliate?.code ?? "—", o.orderNumber, o.createdAt,
      ORDER_STATUS_LABELS[o.status] ?? o.status, o.user.name ?? o.user.email, o.total,
      o.affiliateCommission,
      o.items.map((i) => `${i.product.name} (${i.affiliateCommissionRate}%)`).join(", ") || "—",
    ]),
  };

  const payouts = await prisma.affiliatePayout.findMany({
    orderBy: { createdAt: "desc" },
    include: { affiliate: { select: { name: true, code: true } } },
  });

  const payoutSheet: Sheet = {
    name: "Payouts",
    columns: ["Affiliate", "Code", "Amount (GH₵)", "Status", "Method", "Reference", "Requested", "Paid", "Note"],
    rows: payouts.map((p) => [
      p.affiliate.name, p.affiliate.code ?? "—", p.amount, p.status, p.method || "—",
      p.reference ?? "—", p.createdAt, p.paidAt ?? null, p.note ?? "—",
    ]),
  };

  // What affiliates can currently promote, and on whose budget.
  const [enrolled, defaultCommission, defaultAffiliateRate] = await Promise.all([
    prisma.product.findMany({
      where: { affiliateEnabled: true, isArchived: false },
      orderBy: { name: "asc" },
      include: {
        category: { select: { name: true, commissionRate: true, affiliateCommissionRate: true } },
        vendor: { select: { businessName: true } },
      },
    }),
    getCommissionRate(),
    getAffiliateRate(),
  ]);

  const catalogue: Sheet = {
    name: "Enrolled products",
    columns: [
      "Product", "Shop", "Category", "Price (GH₵)", "Enrolled by", "Requested rate %",
      "Effective rate %", "Capped", "Affiliate earns (GH₵)", "Funded by",
    ],
    rows: enrolled.map((p) => {
      const commissionRate = resolveCommissionRate(p.category?.commissionRate, defaultCommission);
      const a = resolveAffiliateRate({
        affiliateEnabled: p.affiliateEnabled,
        affiliateEnrolledBy: p.affiliateEnrolledBy,
        affiliateCommissionRate: p.affiliateCommissionRate,
        categoryAffiliateRate: p.category?.affiliateCommissionRate,
        defaultAffiliateRate,
        platformCommissionRate: commissionRate,
      });
      return [
        p.name, p.vendor?.businessName ?? "—", p.category?.name ?? "—", p.price,
        p.affiliateEnrolledBy === "admin" ? "NikiMart" : "Seller",
        a.requestedRate, a.rate, yesNo(a.capped), money((p.price * a.rate) / 100),
        fundedByLabel(a.fundedBy),
      ];
    }),
  };

  return [roster, referrals, payoutSheet, catalogue];
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

async function locationsWorkbook(): Promise<Sheet[]> {
  const locations = await getAllLocations();

  // How much of the catalogue each location actually serves.
  const products = await prisma.product.findMany({
    where: { isArchived: false },
    select: { locationIds: true },
  });
  const productsByLocation = new Map<string, number>();
  for (const p of products) {
    try {
      const ids = JSON.parse(p.locationIds);
      if (Array.isArray(ids)) {
        for (const id of ids) productsByLocation.set(id, (productsByLocation.get(id) ?? 0) + 1);
      }
    } catch {
      // malformed row — skip it rather than fail the whole export
    }
  }

  return [
    {
      name: "Locations",
      columns: ["Name", "Type", "Region", "Active", "Sort order", "Delivery zone multiplier", "Products listed"],
      rows: locations.map((l) => [
        l.name, l.type, l.region, yesNo(l.isActive), l.order,
        l.deliveryZoneMultiplier ?? 1,
        (productsByLocation.get(l.id) ?? 0) + (productsByLocation.get("any") ?? 0),
      ]),
    },
  ];
}

// ---------------------------------------------------------------------------
// Pickup points
// ---------------------------------------------------------------------------

async function pickupWorkbook(): Promise<Sheet[]> {
  const points = await prisma.pickupPoint.findMany({
    orderBy: { name: "asc" },
    include: {
      operator: { select: { name: true, email: true, phone: true } },
      _count: { select: { orders: true, preferredByUsers: true, originVendors: true } },
    },
  });

  // Order volume and value per point, so the export shows which are busy.
  const volume = await prisma.order.groupBy({
    by: ["pickupPointId"],
    where: { status: { notIn: ["cancelled", "pending"] } },
    _sum: { total: true },
    _count: { _all: true },
  });
  const volumeByPoint = new Map(volume.map((v) => [v.pickupPointId ?? "", v]));

  return [
    {
      name: "Pickup points",
      columns: [
        "Name", "Code", "Location", "Address", "Active", "Operator", "Operator email",
        "Operator phone", "Orders (all time)", "Paid orders", "Order value (GH₵)",
        "Preferred by customers", "Seller hubs", "Created",
      ],
      rows: points.map((p) => {
        const v = volumeByPoint.get(p.id);
        return [
          p.name, p.code, p.locationName, p.address, yesNo(p.isActive),
          p.operator?.name ?? "—", p.operator?.email ?? "—", p.operator?.phone ?? "—",
          p._count.orders, v?._count._all ?? 0, money(v?._sum.total ?? 0),
          p._count.preferredByUsers, p._count.originVendors, p.createdAt,
        ];
      }),
    },
  ];
}

// ---------------------------------------------------------------------------
// Shipping rates
// ---------------------------------------------------------------------------

async function shippingWorkbook(): Promise<Sheet[]> {
  const [rates, points, settings] = await Promise.all([
    prisma.shippingRate.findMany({
      include: {
        originHub: { select: { name: true, locationName: true } },
        destPickup: { select: { name: true, locationName: true, code: true } },
      },
    }),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    }),
    getSettings(),
  ]);

  const configured = new Set(rates.map((r) => `${r.originHubId}|${r.destPickupId}`));
  const fallback = Number(settings.shippingDefaultRatePerCbm);

  const routeSheet: Sheet = {
    name: "Domestic routes",
    columns: ["Origin hub", "Destination", "Destination code", "Rate (GH₵/CBM)", "Source"],
    rows: [
      ...rates.map((r) => [
        `${r.originHub.name} — ${r.originHub.locationName}`,
        `${r.destPickup.name} — ${r.destPickup.locationName}`,
        r.destPickup.code, r.ratePerCbm, "Configured",
      ]),
      // Every route that falls back to the default, so the sheet shows the full
      // matrix rather than only the rows someone has already filled in.
      ...points.flatMap((origin) =>
        points
          .filter((dest) => !configured.has(`${origin.id}|${dest.id}`))
          .map((dest) => [
            `${origin.name} — ${origin.locationName}`,
            `${dest.name} — ${dest.locationName}`,
            "", origin.id === dest.id ? 0 : fallback,
            origin.id === dest.id ? "Same hub" : "Default rate",
          ]),
      ),
    ],
  };

  const arrivalHub = points.find((p) => p.id === settings.internationalArrivalHubId);
  const intlSheet: Sheet = {
    name: "International",
    columns: ["Origin country", "Rate (GH₵/CBM)"],
    rows: [
      ["China (CN)", Number(settings.intlRatePerCbmCN)],
      ["UAE (AE)", Number(settings.intlRatePerCbmAE)],
      ["United States (US)", Number(settings.intlRatePerCbmUS)],
      ["Europe (EU)", Number(settings.intlRatePerCbmEU)],
      ["All other countries", Number(settings.intlDefaultRatePerCbm)],
    ],
  };

  const configSheet: Sheet = {
    name: "Settings",
    columns: ["Setting", "Value"],
    rows: [
      ["Default domestic rate (GH₵/CBM)", fallback],
      ["International arrival hub", arrivalHub ? `${arrivalHub.name} — ${arrivalHub.locationName}` : "First active pickup point"],
      ["Configured routes", rates.length],
      ["Active pickup points", points.length],
      ["Lead time — China (days)", Number(settings.leadDaysCN)],
      ["Lead time — UAE (days)", Number(settings.leadDaysAE)],
      ["Lead time — US (days)", Number(settings.leadDaysUS)],
      ["Lead time — Europe (days)", Number(settings.leadDaysEU)],
    ],
  };

  return [routeSheet, intlSheet, configSheet];
}

// ---------------------------------------------------------------------------

const BUILDERS: Record<ExportDataset, () => Promise<Sheet[]>> = {
  products: productsWorkbook,
  shops: shopsWorkbook,
  categories: categoriesWorkbook,
  users: usersWorkbook,
  orders: ordersWorkbook,
  finance: financeWorkbook,
  affiliates: affiliatesWorkbook,
  locations: locationsWorkbook,
  pickup: pickupWorkbook,
  shipping: shippingWorkbook,
};

export async function buildExport(dataset: ExportDataset): Promise<Sheet[]> {
  return BUILDERS[dataset]();
}
