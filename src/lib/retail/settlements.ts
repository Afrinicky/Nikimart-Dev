import "server-only";
import { prisma } from "@/lib/prisma";
import { getSellerEarnings, type SellerEarnings } from "@/lib/seller";
import { bucketSize, dayKey, type OverviewWindow } from "@/lib/data-bundles/overview-window";

/**
 * What every shop is owed, and what has been sent.
 *
 * Settling a seller used to be a figure on the finance page and a form two
 * clicks behind it, with no way to tell who had been waiting longest, no way
 * to see where to send the money, and no record on the screen of what had
 * already gone. An admin settling ten shops had to hold all of that in their
 * head.
 *
 * So a settlement is a row: what the shop sold, what Nickimart kept, what is
 * still held against undelivered orders, what has cleared, what has been paid,
 * and what is payable right now — next to the MoMo number it would go to and
 * the date of the last payment. The row is the decision; the window behind it
 * is where the payment is made.
 */

export const SETTLEMENT_STATUS_OPTIONS = [
  { value: "all", label: "All shops" },
  { value: "payable", label: "Payable now" },
  { value: "requested", label: "Payout requested" },
  { value: "holding", label: "Holding — nothing cleared" },
  { value: "settled", label: "Settled up" },
  { value: "nodetails", label: "No payout details" },
] as const;

export const SETTLEMENT_SORT_OPTIONS = [
  { value: "available", label: "Most payable" },
  { value: "waiting", label: "Longest waiting" },
  { value: "gross", label: "Biggest seller" },
  { value: "name", label: "Shop name" },
] as const;

export function settlementStatusFilter(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return SETTLEMENT_STATUS_OPTIONS.some((o) => o.value === value) ? value : "all";
}

export function settlementSort(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return SETTLEMENT_SORT_OPTIONS.some((o) => o.value === value) ? value : "available";
}

export type SettlementState = "payable" | "requested" | "holding" | "settled" | "nodetails";

export const SETTLEMENT_LABELS: Record<SettlementState, string> = {
  payable: "Payable now",
  requested: "Payout requested",
  holding: "Holding",
  settled: "Settled up",
  nodetails: "No payout details",
};

export const SETTLEMENT_TONES: Record<SettlementState, string> = {
  payable: "bg-niki-orange/10 text-niki-orange ring-1 ring-niki-orange/25",
  requested: "bg-niki-gold/20 text-amber-900 ring-1 ring-niki-gold/30",
  holding: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/25",
  settled: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  nodetails: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/25",
};

export const SETTLEMENT_COLOUR: Record<SettlementState, string> = {
  payable: "#ea580c",
  requested: "#d97706",
  holding: "#0284c7",
  settled: "#059669",
  nodetails: "#dc2626",
};

export interface SettlementRow {
  id: string;
  businessName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  whatsapp: string;
  /** Where the money goes. Empty means it cannot go anywhere yet. */
  payoutMethod: string;
  payoutTarget: string;
  payoutName: string;
  earnings: SellerEarnings;
  state: SettlementState;
  /** Requests waiting on a decision, and what they add up to. */
  pendingCount: number;
  /** When they were last paid, and how long ago. */
  lastPaidAt: Date | null;
  /** Days since the oldest unsettled delivered order — how long they have waited. */
  waitingDays: number;
  payoutCount: number;
}

/** Where a shop's money would go, as one line. */
export function payoutTargetOf(v: {
  payoutMethod: string;
  momoNumber: string;
  momoName: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
}): { method: string; target: string; name: string } {
  if (v.payoutMethod === "momo" && v.momoNumber.trim()) {
    return { method: "Mobile money", target: v.momoNumber.trim(), name: v.momoName.trim() };
  }
  if (v.payoutMethod === "bank" && v.bankAccountNumber.trim()) {
    return {
      method: v.bankName.trim() || "Bank transfer",
      target: v.bankAccountNumber.trim(),
      name: v.bankAccountName.trim(),
    };
  }
  return { method: "", target: "", name: "" };
}

function stateOf(e: SellerEarnings, hasDetails: boolean, pendingCount: number): SettlementState {
  if (pendingCount > 0) return "requested";
  if (e.available > 0) return hasDetails ? "payable" : "nodetails";
  if (e.inEscrow > 0) return "holding";
  return "settled";
}

/**
 * Every shop that has ever traded, with its settlement position.
 *
 * Shops that have never sold anything and never been paid are left out: a
 * settlement list padded with shops that owe nothing is a list nobody reads to
 * the bottom.
 */
export async function getSettlements(): Promise<SettlementRow[]> {
  const vendors = await prisma.vendor.findMany({
    select: {
      id: true,
      businessName: true,
      slug: true,
      whatsapp: true,
      payoutMethod: true,
      momoNumber: true,
      momoName: true,
      bankName: true,
      bankAccountName: true,
      bankAccountNumber: true,
      owner: { select: { name: true, email: true, phone: true } },
    },
    orderBy: { businessName: "asc" },
  });

  const [payouts, oldestUnpaid] = await Promise.all([
    prisma.payout.findMany({
      select: { vendorId: true, amount: true, status: true, paidAt: true, createdAt: true },
    }),
    // The oldest delivered order per shop, for "how long have they waited".
    prisma.orderItem.findMany({
      where: { order: { status: "delivered" } },
      select: { product: { select: { vendorId: true } }, order: { select: { createdAt: true } } },
    }),
  ]);

  const byVendor = new Map<string, { paid: Date | null; pending: number; count: number }>();
  for (const p of payouts) {
    const at = byVendor.get(p.vendorId) ?? { paid: null, pending: 0, count: 0 };
    if (p.status === "paid") {
      const when = p.paidAt ?? p.createdAt;
      if (!at.paid || when > at.paid) at.paid = when;
      at.count += 1;
    }
    if (p.status === "pending") at.pending += 1;
    byVendor.set(p.vendorId, at);
  }

  const oldest = new Map<string, Date>();
  for (const row of oldestUnpaid) {
    const id = row.product.vendorId;
    const at = oldest.get(id);
    if (!at || row.order.createdAt < at) oldest.set(id, row.order.createdAt);
  }

  const now = Date.now();
  const rows = await Promise.all(
    vendors.map(async (v) => {
      const earnings = await getSellerEarnings(v.id);
      const payout = payoutTargetOf(v);
      const meta = byVendor.get(v.id) ?? { paid: null, pending: 0, count: 0 };
      const since = oldest.get(v.id);
      return {
        id: v.id,
        businessName: v.businessName,
        slug: v.slug,
        ownerName: v.owner?.name ?? "",
        ownerEmail: v.owner?.email ?? "",
        ownerPhone: v.owner?.phone ?? "",
        whatsapp: v.whatsapp,
        payoutMethod: payout.method,
        payoutTarget: payout.target,
        payoutName: payout.name,
        earnings,
        state: stateOf(earnings, Boolean(payout.target), meta.pending),
        pendingCount: meta.pending,
        lastPaidAt: meta.paid,
        waitingDays:
          earnings.available > 0 && since
            ? Math.max(0, Math.floor((now - since.getTime()) / 86_400_000))
            : 0,
        payoutCount: meta.count,
      } satisfies SettlementRow;
    }),
  );

  return rows.filter(
    (r) => r.earnings.gross > 0 || r.earnings.paidOut > 0 || r.earnings.pendingPayouts > 0,
  );
}

export interface SettlementTotals {
  shops: number;
  payable: number;
  payableShops: number;
  requested: number;
  requestedShops: number;
  inEscrow: number;
  paidOut: number;
  gross: number;
  commission: number;
  missingDetails: number;
  longestWaitDays: number;
  longestWaitShop: string;
}

export function summarise(rows: SettlementRow[]): SettlementTotals {
  const round = (n: number) => Math.round(n * 100) / 100;
  const longest = rows.reduce<SettlementRow | null>(
    (worst, r) => (!worst || r.waitingDays > worst.waitingDays ? r : worst),
    null,
  );
  return {
    shops: rows.length,
    payable: round(rows.reduce((s, r) => s + r.earnings.available, 0)),
    payableShops: rows.filter((r) => r.earnings.available > 0).length,
    requested: round(rows.reduce((s, r) => s + r.earnings.pendingPayouts, 0)),
    requestedShops: rows.filter((r) => r.pendingCount > 0).length,
    inEscrow: round(rows.reduce((s, r) => s + r.earnings.inEscrow, 0)),
    paidOut: round(rows.reduce((s, r) => s + r.earnings.paidOut, 0)),
    gross: round(rows.reduce((s, r) => s + r.earnings.gross, 0)),
    commission: round(rows.reduce((s, r) => s + r.earnings.commission, 0)),
    missingDetails: rows.filter((r) => r.state === "nodetails").length,
    longestWaitDays: longest?.waitingDays ?? 0,
    longestWaitShop: longest && longest.waitingDays > 0 ? longest.businessName : "",
  };
}

/** Filter, sort and page the list the way every other console table does. */
export function applyFilters(
  rows: SettlementRow[],
  { status, sort, query }: { status: string; sort: string; query: string },
): SettlementRow[] {
  let out = rows;
  if (status !== "all") out = out.filter((r) => r.state === status);

  const term = query.trim().toLowerCase();
  if (term) {
    out = out.filter((r) =>
      `${r.businessName} ${r.ownerName} ${r.ownerEmail} ${r.ownerPhone} ${r.payoutTarget}`
        .toLowerCase()
        .includes(term),
    );
  }

  const sorted = [...out];
  if (sort === "available") sorted.sort((a, b) => b.earnings.available - a.earnings.available);
  if (sort === "waiting") sorted.sort((a, b) => b.waitingDays - a.waitingDays);
  if (sort === "gross") sorted.sort((a, b) => b.earnings.gross - a.earnings.gross);
  if (sort === "name") sorted.sort((a, b) => a.businessName.localeCompare(b.businessName));
  return sorted;
}

export interface PayoutPoint {
  day: string;
  endDay?: string;
  amount: number;
  count: number;
}

/**
 * What actually went out to sellers over the window.
 *
 * Dated by when the money left rather than when it was requested: a payout
 * belongs to the month it was paid in, which is the month it has to be
 * reconciled against.
 */
export async function getPayoutSeries(w: OverviewWindow): Promise<PayoutPoint[]> {
  const rows = await prisma.payout
    .findMany({
      where: { status: "paid" },
      select: { amount: true, paidAt: true, createdAt: true },
    })
    .catch(() => []);

  const paid = rows
    .map((p) => ({ amount: p.amount, at: p.paidAt ?? p.createdAt }))
    .filter((p) => (!w.start || p.at >= w.start) && p.at < w.end);

  const start = w.start ?? (paid.length > 0 ? new Date(Math.min(...paid.map((p) => p.at.getTime()))) : null);
  if (!start) return [];
  start.setHours(0, 0, 0, 0);

  const span = Math.max(1, Math.round((w.end.getTime() - start.getTime()) / 86_400_000));
  const size = bucketSize(span);
  const count = Math.ceil(span / size);
  const last = new Date(w.end);
  last.setDate(last.getDate() - 1);

  const buckets: PayoutPoint[] = Array.from({ length: count }, (_, i) => {
    const from = new Date(start);
    from.setDate(start.getDate() + i * size);
    const to = new Date(from);
    to.setDate(from.getDate() + size - 1);
    return {
      day: dayKey(from),
      ...(size > 1 ? { endDay: dayKey(to > last ? last : to) } : {}),
      amount: 0,
      count: 0,
    };
  });

  for (const p of paid) {
    const at = new Date(p.at);
    at.setHours(0, 0, 0, 0);
    const offset = Math.floor((at.getTime() - start.getTime()) / 86_400_000);
    const point = buckets[Math.floor(offset / size)];
    if (!point) continue;
    point.amount = Math.round((point.amount + p.amount) * 100) / 100;
    point.count += 1;
  }
  return buckets;
}

/** One shop's settlement, with its payment history. */
export async function getSettlement(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      businessName: true,
      slug: true,
      whatsapp: true,
      payoutMethod: true,
      momoNumber: true,
      momoName: true,
      bankName: true,
      bankAccountName: true,
      bankAccountNumber: true,
      verificationStatus: true,
      owner: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
  if (!vendor) return null;

  const [earnings, payouts, products] = await Promise.all([
    getSellerEarnings(vendor.id),
    prisma.payout.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.product.count({ where: { vendorId: vendor.id } }),
  ]);

  return { vendor, earnings, payouts, products, payout: payoutTargetOf(vendor) };
}

export type SettlementDossier = NonNullable<Awaited<ReturnType<typeof getSettlement>>>;
