import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Everything somebody has complained about, in one queue.
 *
 * Complaints arrived in three places and were worked in none of them. An
 * affiliate's enquiry sat in the affiliate console, a buyer's complaint sat in
 * a thread only their affiliate could see, and a purchase that went wrong sat
 * on the purchase record — so "what is unhappy right now" had no answer, and
 * the question an admin actually asks is exactly that.
 *
 * One desk. Three sources, one shape, one order: the oldest thing that nobody
 * has answered is at the top, because that is the one about to become a
 * second complaint.
 */

export type ComplaintSource = "enquiry" | "customer" | "dispute";

export const COMPLAINT_SOURCE_LABELS: Record<ComplaintSource, string> = {
  enquiry: "Affiliate enquiry",
  customer: "Customer complaint",
  dispute: "Supplier dispute",
};

export const COMPLAINT_SOURCE_TONES: Record<ComplaintSource, string> = {
  enquiry: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/25",
  customer: "bg-niki-orange/10 text-niki-orange ring-1 ring-niki-orange/25",
  dispute: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/25",
};

export const COMPLAINT_SOURCE_COLOUR: Record<ComplaintSource, string> = {
  enquiry: "#0284c7",
  customer: "#ea580c",
  dispute: "#dc2626",
};

export const COMPLAINT_SOURCE_OPTIONS = [
  { value: "all", label: "Everything" },
  { value: "enquiry", label: "Affiliate enquiries" },
  { value: "customer", label: "Customer complaints" },
  { value: "dispute", label: "Supplier disputes" },
] as const;

export const COMPLAINT_STATE_OPTIONS = [
  { value: "open", label: "Still open" },
  { value: "urgent", label: "Urgent only" },
  { value: "resolved", label: "Settled" },
  { value: "all", label: "Open and settled" },
] as const;

export function sourceFilter(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return COMPLAINT_SOURCE_OPTIONS.some((o) => o.value === value) ? value : "all";
}

export function stateFilter(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return COMPLAINT_STATE_OPTIONS.some((o) => o.value === value) ? value : "open";
}

export interface Complaint {
  id: string;
  source: ComplaintSource;
  subject: string;
  /** The last thing said, or what was written down about the problem. */
  summary: string;
  topic: string;
  /** normal | high | urgent. A dispute is always urgent — money is out. */
  priority: string;
  open: boolean;
  /** How it reads on screen: "Waiting on us", "Answered", "Settled". */
  stateLabel: string;
  raisedAt: Date;
  lastAt: Date;
  /** Days since anybody said anything. */
  quietDays: number;
  /** Who to talk to. */
  personName: string;
  personRole: string;
  phone: string;
  whatsapp: string;
  email: string;
  /** Where it is worked. */
  href: string;
  orderNumber: string;
  orderId: string;
  /** What is at stake, where there is a figure. */
  amount: number;
}

const DAY = 86_400_000;

function quiet(at: Date, now: number): number {
  return Math.max(0, Math.floor((now - at.getTime()) / DAY));
}

/**
 * Everything open, worst first.
 *
 * Disputes lead because money has already left the building; after that it is
 * whatever has gone unanswered longest. Resolved items are fetched only when
 * asked for — a desk whose default view includes everything ever settled is a
 * desk nobody can see the work in.
 */
export async function getComplaints(
  { state = "open", source = "all" }: { state?: string; source?: string } = {},
  now: Date = new Date(),
): Promise<Complaint[]> {
  const wantOpen = state !== "resolved";
  const wantResolved = state === "resolved" || state === "all";

  const threadWhere = {
    ...(state === "resolved"
      ? { status: "resolved" }
      : state === "all"
        ? {}
        : { status: { not: "resolved" } }),
  };

  const [threads, disputes] = await Promise.all([
    source === "dispute"
      ? Promise.resolve([])
      : prisma.affiliateThread
          .findMany({
            where: threadWhere,
            orderBy: { lastMessageAt: "asc" },
            take: 500,
            select: {
              id: true,
              kind: true,
              topic: true,
              subject: true,
              status: true,
              priority: true,
              createdAt: true,
              lastMessageAt: true,
              lastMessageText: true,
              affiliate: { select: { id: true, name: true, phone: true, email: true } },
              customer: { select: { name: true, email: true, phone: true } },
              order: { select: { id: true, orderNumber: true, total: true } },
            },
          })
          .catch(() => []),
    source === "enquiry" || source === "customer"
      ? Promise.resolve([])
      : prisma.purchaseOrder
          .findMany({
            where: wantResolved && !wantOpen
              ? { disputeStatus: { in: ["refunded", "written_off"] } }
              : state === "all"
                ? { disputeStatus: { not: "none" } }
                : { disputeStatus: "raised" },
            orderBy: { disputeAt: "asc" },
            take: 200,
            select: {
              id: true,
              reference: true,
              supplierName: true,
              supplierContact: true,
              disputeStatus: true,
              disputeNote: true,
              disputeAt: true,
              createdAt: true,
              totalCost: true,
              amountPaid: true,
              items: {
                take: 1,
                select: { order: { select: { id: true, orderNumber: true } } },
              },
            },
          })
          .catch(() => []),
  ]);

  const stamp = now.getTime();
  const rows: Complaint[] = [];

  for (const t of threads) {
    const isSupport = t.kind === "support";
    const last = t.lastMessageAt ?? t.createdAt;
    const open = t.status !== "resolved";
    // An affiliate's enquiry is waiting on Nickimart; a customer thread is
    // waiting on whoever spoke last, which the status already records.
    const stateLabel =
      t.status === "resolved"
        ? "Settled"
        : t.status === "waiting_affiliate"
          ? "Answered"
          : t.status === "waiting_customer"
            ? "Waiting on the buyer"
            : "Waiting on us";
    const person = isSupport ? t.affiliate : (t.customer ?? t.affiliate);
    rows.push({
      id: t.id,
      source: isSupport ? "enquiry" : "customer",
      subject: t.subject || t.topic || "An enquiry",
      summary: t.lastMessageText || "No messages yet.",
      topic: t.topic,
      priority: t.priority,
      open,
      stateLabel,
      raisedAt: t.createdAt,
      lastAt: last,
      quietDays: quiet(last, stamp),
      personName:
        (person && "name" in person ? person.name : null) ?? t.affiliate?.name ?? "Someone",
      personRole: isSupport ? "Affiliate" : t.customer ? "Customer" : "Affiliate",
      phone:
        (t.customer?.phone ?? "") ||
        (isSupport ? (t.affiliate?.phone ?? "") : (t.affiliate?.phone ?? "")),
      whatsapp:
        (t.customer?.phone ?? "") || (t.affiliate?.phone ?? ""),
      email: (t.customer?.email ?? "") || (t.affiliate?.email ?? ""),
      href: `/admin/affiliates/support/${t.id}`,
      orderNumber: t.order?.orderNumber ?? "",
      orderId: t.order?.id ?? "",
      amount: t.order?.total ?? 0,
    });
  }

  for (const d of disputes) {
    const at = d.disputeAt ?? d.createdAt;
    rows.push({
      id: d.id,
      source: "dispute",
      subject: `${d.reference} — ${d.supplierName || "supplier"}`,
      summary: d.disputeNote || "Flagged with no note.",
      topic: "supplier",
      // Money has left the building, so it never sits below a nit.
      priority: "urgent",
      open: d.disputeStatus === "raised",
      stateLabel:
        d.disputeStatus === "raised"
          ? "Claim open"
          : d.disputeStatus === "refunded"
            ? "Refunded"
            : "Written off",
      raisedAt: at,
      lastAt: at,
      quietDays: quiet(at, stamp),
      personName: d.supplierName || "Supplier",
      personRole: "Supplier",
      phone: d.supplierContact,
      whatsapp: d.supplierContact,
      email: "",
      href: `/admin/orders/placement/purchase/${d.id}`,
      orderNumber: d.items[0]?.order.orderNumber ?? "",
      orderId: d.items[0]?.order.id ?? "",
      amount: d.amountPaid > 0 ? d.amountPaid : d.totalCost,
    });
  }

  const rank = { urgent: 0, high: 1, normal: 2 } as const;
  return rows
    .filter((r) => (source === "all" ? true : r.source === source))
    .filter((r) => (state === "urgent" ? r.open && r.priority === "urgent" : true))
    .sort((a, b) => {
      // Open before settled, then a dispute, then whatever has waited longest.
      if (a.open !== b.open) return a.open ? -1 : 1;
      const ra = rank[a.priority as keyof typeof rank] ?? 2;
      const rb = rank[b.priority as keyof typeof rank] ?? 2;
      if (ra !== rb) return ra - rb;
      return a.lastAt.getTime() - b.lastAt.getTime();
    });
}

export interface ComplaintSummary {
  open: number;
  urgent: number;
  enquiries: number;
  customers: number;
  disputes: number;
  /** Open items nobody has touched for a week. */
  stale: number;
  /** What the open disputes are worth. */
  atRisk: number;
  longestQuietDays: number;
}

export function summarise(rows: Complaint[]): ComplaintSummary {
  const open = rows.filter((r) => r.open);
  return {
    open: open.length,
    urgent: open.filter((r) => r.priority === "urgent").length,
    enquiries: open.filter((r) => r.source === "enquiry").length,
    customers: open.filter((r) => r.source === "customer").length,
    disputes: open.filter((r) => r.source === "dispute").length,
    stale: open.filter((r) => r.quietDays >= 7).length,
    atRisk:
      Math.round(
        open.filter((r) => r.source === "dispute").reduce((s, r) => s + r.amount, 0) * 100,
      ) / 100,
    longestQuietDays: open.reduce((worst, r) => Math.max(worst, r.quietDays), 0),
  };
}

/**
 * How many are open, for the tab badge.
 *
 * Two counts rather than the full queue: every announcements screen renders
 * this, and none of them needs the rows.
 */
export async function countOpenComplaints(): Promise<number> {
  const [threads, disputes] = await Promise.all([
    prisma.affiliateThread.count({ where: { status: { not: "resolved" } } }).catch(() => 0),
    prisma.purchaseOrder.count({ where: { disputeStatus: "raised" } }).catch(() => 0),
  ]);
  return threads + disputes;
}
