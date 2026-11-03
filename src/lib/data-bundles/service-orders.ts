import "server-only";
import { dataDb } from "@/lib/data-db";
import { readStoredAnswers } from "@/lib/data-bundles/service-fields";
import { isServiceStatus } from "@/lib/data-bundles/service-status";

/**
 * Reading service orders — the admin's queue, an agent's sales, and the one
 * order a customer is standing there waiting for.
 *
 * Documents are never selected alongside a list. Each one is a data URL of up
 * to a few megabytes, and a page of thirty orders that dragged ninety
 * megabytes behind it would be a page nobody waits for. They are counted in a
 * list and read one order at a time.
 */

// Status labels and tones live in service-status, which is pure: they are
// read on both sides of the client boundary and this module is server-only.
export {
  SERVICE_STATUSES,
  SERVICE_STATUS_LABELS,
  SERVICE_STATUS_NOTE,
  SERVICE_STATUS_TONES,
  isServiceStatus,
  type ServiceStatus,
} from "@/lib/data-bundles/service-status";

export interface ServiceOrderRow {
  id: string;
  reference: string;
  serviceId: string | null;
  serviceName: string;
  variantId: string | null;
  variantName: string;
  speedLabel: string;
  turnaround: string;
  price: number;
  agentCost: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  status: string;
  paymentStatus: string;
  adminNote: string;
  agentId: string | null;
  agentCommission: number;
  commissionStatus: string;
  documentCount: number;
  paidAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ServiceOrderDetail extends ServiceOrderRow {
  answers: Array<{ key: string; label: string; value: string }>;
  documents: Array<{
    id: string;
    fieldKey: string;
    label: string;
    fileName: string;
    mimeType: string;
    size: number;
    createdAt: Date;
  }>;
}

const LIST_SELECT = {
  id: true,
  reference: true,
  serviceId: true,
  serviceName: true,
  variantId: true,
  variantName: true,
  speedLabel: true,
  turnaround: true,
  price: true,
  agentCost: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  status: true,
  paymentStatus: true,
  adminNote: true,
  agentId: true,
  agentCommission: true,
  commissionStatus: true,
  paidAt: true,
  completedAt: true,
  createdAt: true,
  _count: { select: { documents: true } },
} as const;

type ListRow = Omit<ServiceOrderRow, "documentCount"> & { _count: { documents: number } };

function shape(row: ListRow): ServiceOrderRow {
  const { _count, ...rest } = row;
  return { ...rest, documentCount: _count.documents };
}

export interface ServiceOrderFilters {
  status?: string;
  serviceId?: string;
  /** A reference, a phone number or part of a name. */
  query?: string;
  agentId?: string;
  take?: number;
  skip?: number;
}

function whereFrom(filters: ServiceOrderFilters) {
  const q = (filters.query ?? "").trim();
  return {
    ...(isServiceStatus(filters.status) ? { status: filters.status } : {}),
    ...(filters.serviceId ? { serviceId: filters.serviceId } : {}),
    ...(filters.agentId ? { agentId: filters.agentId } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q.toUpperCase() } },
            { customerPhone: { contains: q } },
            { customerName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

/** A page of orders, newest first, with the total behind it. */
export async function getServiceOrders(
  filters: ServiceOrderFilters = {},
): Promise<{ rows: ServiceOrderRow[]; total: number }> {
  const take = Math.min(Math.max(filters.take ?? 25, 1), 100);
  try {
    const where = whereFrom(filters);
    const [rows, total] = await Promise.all([
      dataDb.dataServiceOrder.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { createdAt: "desc" },
        take,
        skip: Math.max(filters.skip ?? 0, 0),
      }),
      dataDb.dataServiceOrder.count({ where }),
    ]);
    return { rows: rows.map(shape), total };
  } catch {
    return { rows: [], total: 0 };
  }
}

/** One order in full — answers and the documents attached to it. */
export async function getServiceOrder(reference: string): Promise<ServiceOrderDetail | null> {
  try {
    const row = await dataDb.dataServiceOrder.findUnique({
      where: { reference: reference.trim().toUpperCase() },
      select: {
        ...LIST_SELECT,
        answers: true,
        documents: {
          select: {
            id: true,
            fieldKey: true,
            label: true,
            fileName: true,
            mimeType: true,
            size: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!row) return null;
    const { answers, documents, ...rest } = row;
    return { ...shape(rest), answers: readStoredAnswers(answers), documents };
  } catch {
    return null;
  }
}

/** One document's bytes. Read on its own, never alongside a list. */
export async function getServiceDocument(id: string) {
  try {
    return await dataDb.dataServiceDocument.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        label: true,
        fileName: true,
        mimeType: true,
        size: true,
        dataUrl: true,
        order: { select: { reference: true, customerName: true } },
      },
    });
  } catch {
    return null;
  }
}

/** Every document on file, newest first — the admin's Documents tab. */
export async function getServiceDocuments(take = 60, skip = 0) {
  try {
    const [rows, total] = await Promise.all([
      dataDb.dataServiceDocument.findMany({
        select: {
          id: true,
          label: true,
          fileName: true,
          mimeType: true,
          size: true,
          createdAt: true,
          order: {
            select: { reference: true, customerName: true, serviceName: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(take, 1), 200),
        skip: Math.max(skip, 0),
      }),
      dataDb.dataServiceDocument.count(),
    ]);
    return { rows, total };
  } catch {
    return { rows: [], total: 0 };
  }
}

/**
 * Who has bought what.
 *
 * There is no customer table — the store sells to guests — so a customer is
 * what the orders say they are: a phone number, the most recent name given
 * with it, and everything bought under it. Grouped in the database rather than
 * in memory, because the list it is grouping is every order ever placed.
 */
export interface ServiceCustomerRow {
  phone: string;
  name: string;
  email: string;
  orders: number;
  paidOrders: number;
  spend: number;
  lastOrderAt: Date;
}

export async function getServiceCustomers(take = 50): Promise<ServiceCustomerRow[]> {
  try {
    const grouped = await dataDb.dataServiceOrder.groupBy({
      by: ["customerPhone"],
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: Math.min(Math.max(take, 1), 200),
    });
    if (grouped.length === 0) return [];

    const phones = grouped.map((g) => g.customerPhone);
    // The latest order per phone carries the name and email to show; the paid
    // ones carry the spend. Two narrow reads beat loading every order.
    const [latest, paid] = await Promise.all([
      dataDb.dataServiceOrder.findMany({
        where: { customerPhone: { in: phones } },
        select: { customerPhone: true, customerName: true, customerEmail: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      dataDb.dataServiceOrder.groupBy({
        by: ["customerPhone"],
        where: { customerPhone: { in: phones }, paymentStatus: "paid" },
        _count: { _all: true },
        _sum: { price: true },
      }),
    ]);

    const identity = new Map<string, { name: string; email: string }>();
    for (const row of latest) {
      if (identity.has(row.customerPhone)) continue;
      identity.set(row.customerPhone, { name: row.customerName, email: row.customerEmail });
    }
    const spend = new Map(paid.map((p) => [p.customerPhone, p]));

    return grouped.map((g) => {
      const who = identity.get(g.customerPhone);
      const money = spend.get(g.customerPhone);
      return {
        phone: g.customerPhone,
        name: who?.name ?? "",
        email: who?.email ?? "",
        orders: g._count._all,
        paidOrders: money?._count._all ?? 0,
        spend: Math.round((money?._sum.price ?? 0) * 100) / 100,
        lastOrderAt: g._max.createdAt ?? new Date(),
      };
    });
  } catch {
    return [];
  }
}

/** What the services shelf has earned, for the overview tiles. */
export interface ServiceTotals {
  orders: number;
  revenue: number;
  /** Revenue less what agents earned on it. */
  net: number;
  commission: number;
  /** Paid but not yet completed — the queue somebody has to work through. */
  open: number;
}

export async function getServiceTotals(range?: {
  gte?: Date | null;
  lt?: Date;
}): Promise<ServiceTotals> {
  const empty: ServiceTotals = { orders: 0, revenue: 0, net: 0, commission: 0, open: 0 };
  try {
    const within = range
      ? { createdAt: { ...(range.gte ? { gte: range.gte } : {}), ...(range.lt ? { lt: range.lt } : {}) } }
      : {};
    const [sold, open] = await Promise.all([
      dataDb.dataServiceOrder.aggregate({
        where: { paymentStatus: "paid", status: { notIn: ["refunded", "cancelled"] }, ...within },
        _count: { _all: true },
        _sum: { price: true, agentCommission: true },
      }),
      dataDb.dataServiceOrder.count({
        where: { paymentStatus: "paid", status: { in: ["paid", "processing"] } },
      }),
    ]);
    const revenue = Math.round((sold._sum.price ?? 0) * 100) / 100;
    const commission = Math.round((sold._sum.agentCommission ?? 0) * 100) / 100;
    return {
      orders: sold._count._all,
      revenue,
      commission,
      net: Math.round((revenue - commission) * 100) / 100,
      open,
    };
  } catch {
    return empty;
  }
}

/** One agent's service earnings, for their own overview. */
export async function getAgentServiceTotals(agentId: string): Promise<{
  orders: number;
  sales: number;
  earned: number;
  pending: number;
}> {
  try {
    const [sold, earned, pending] = await Promise.all([
      dataDb.dataServiceOrder.aggregate({
        where: { agentId, paymentStatus: "paid", status: { notIn: ["refunded", "cancelled"] } },
        _count: { _all: true },
        _sum: { price: true },
      }),
      dataDb.dataServiceOrder.aggregate({
        where: { agentId, commissionStatus: "earned" },
        _sum: { agentCommission: true },
      }),
      dataDb.dataServiceOrder.aggregate({
        where: { agentId, commissionStatus: "pending", paymentStatus: "paid" },
        _sum: { agentCommission: true },
      }),
    ]);
    return {
      orders: sold._count._all,
      sales: Math.round((sold._sum.price ?? 0) * 100) / 100,
      earned: Math.round((earned._sum.agentCommission ?? 0) * 100) / 100,
      pending: Math.round((pending._sum.agentCommission ?? 0) * 100) / 100,
    };
  } catch {
    return { orders: 0, sales: 0, earned: 0, pending: 0 };
  }
}

/**
 * The admin's queue, with everything needed to actually work an order.
 *
 * Answers and document *metadata* come along; the files themselves do not. A
 * page of twenty-five applications is a page of text and filenames, which is
 * what makes it a queue somebody can read rather than a download.
 */
export interface AdminServiceOrder extends ServiceOrderRow {
  source: string;
  agentName: string | null;
  answers: Array<{ key: string; label: string; value: string }>;
  documents: Array<{ id: string; label: string; fileName: string; size: number }>;
}

export async function getAdminServiceOrders(
  filters: ServiceOrderFilters = {},
): Promise<{ rows: AdminServiceOrder[]; total: number }> {
  const take = Math.min(Math.max(filters.take ?? 25, 1), 100);
  try {
    const where = whereFrom(filters);
    const [rows, total] = await Promise.all([
      dataDb.dataServiceOrder.findMany({
        where,
        select: {
          ...LIST_SELECT,
          source: true,
          answers: true,
          agent: { select: { storeName: true } },
          documents: { select: { id: true, label: true, fileName: true, size: true } },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip: Math.max(filters.skip ?? 0, 0),
      }),
      dataDb.dataServiceOrder.count({ where }),
    ]);

    return {
      rows: rows.map((row) => {
        const { answers, agent, documents, source, ...rest } = row;
        return {
          ...shape(rest),
          source,
          agentName: agent?.storeName ?? null,
          answers: readStoredAnswers(answers),
          documents,
        };
      }),
      total,
    };
  } catch {
    return { rows: [], total: 0 };
  }
}
