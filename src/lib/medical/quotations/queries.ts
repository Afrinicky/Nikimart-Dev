import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";

/**
 * Reading the quotation side.
 *
 * A request and a quotation are two records and two screens: a request is what
 * a customer asked for, a quotation is what we offered, and one request can
 * produce several versions of an offer. Collapsing them would lose the question
 * the moment somebody answered it.
 */

export async function listQuotationRequests(filters: {
  q?: string;
  status?: string;
  assigneeId?: string;
  skip?: number;
  take?: number;
}) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    ...(filters.q
      ? {
          OR: [
            { reference: { contains: filters.q, mode: "insensitive" as const } },
            { contactName: { contains: filters.q, mode: "insensitive" as const } },
            { contactEmail: { contains: filters.q, mode: "insensitive" as const } },
            { institutionName: { contains: filters.q, mode: "insensitive" as const } },
            { organisation: { name: { contains: filters.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  return readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.quotationRequest.findMany({
          where,
          select: {
            id: true,
            reference: true,
            status: true,
            source: true,
            contactName: true,
            institutionName: true,
            requiredBy: true,
            submittedAt: true,
            specialRequest: true,
            organisation: { select: { id: true, name: true } },
            customer: { select: { id: true, name: true } },
            assignee: { select: { id: true, name: true } },
            _count: { select: { items: true, quotations: true } },
          },
          orderBy: { submittedAt: "desc" },
          skip: filters.skip ?? 0,
          take: filters.take ?? 25,
        }),
        medicalDb.quotationRequest.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );
}

export async function getQuotationRequest(id: string) {
  return readMedical(
    () =>
      medicalDb.quotationRequest.findUnique({
        where: { id },
        include: {
          organisation: { select: { id: true, name: true, kind: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
          assignee: { select: { id: true, name: true } },
          items: {
            orderBy: { position: "asc" },
            include: {
              product: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  price: true,
                  purchaseCost: true,
                  unitOfSale: true,
                  stockOnHand: true,
                  stockReserved: true,
                },
              },
            },
          },
          quotations: {
            orderBy: [{ reference: "asc" }, { version: "desc" }],
            select: {
              id: true,
              reference: true,
              version: true,
              documentType: true,
              status: true,
              totalPayable: true,
              issuedAt: true,
              validUntil: true,
            },
          },
          events: { orderBy: { createdAt: "desc" }, take: 40 },
        },
      }),
    null,
  );
}

export async function listQuotations(filters: {
  q?: string;
  status?: string;
  documentType?: string;
  skip?: number;
  take?: number;
}) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.documentType ? { documentType: filters.documentType } : {}),
    ...(filters.q
      ? {
          OR: [
            { reference: { contains: filters.q, mode: "insensitive" as const } },
            { billToName: { contains: filters.q, mode: "insensitive" as const } },
            { organisation: { name: { contains: filters.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  return readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.quotation.findMany({
          where,
          select: {
            id: true,
            reference: true,
            version: true,
            documentType: true,
            status: true,
            billToName: true,
            currency: true,
            totalPayable: true,
            issuedAt: true,
            sentAt: true,
            validUntil: true,
            acceptedAt: true,
            createdAt: true,
            organisation: { select: { id: true, name: true } },
            request: { select: { id: true, reference: true } },
            issuedBy: { select: { name: true } },
            _count: { select: { items: true, salesOrders: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: filters.skip ?? 0,
          take: filters.take ?? 25,
        }),
        medicalDb.quotation.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );
}

export async function getQuotation(id: string) {
  return readMedical(
    () =>
      medicalDb.quotation.findUnique({
        where: { id },
        include: {
          organisation: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
          request: { select: { id: true, reference: true, status: true } },
          issuedBy: { select: { id: true, name: true } },
          supersedes: { select: { id: true, reference: true, version: true } },
          supersededBy: { select: { id: true, reference: true, version: true } },
          items: {
            orderBy: { position: "asc" },
            include: {
              product: { select: { id: true, sku: true, unitOfSale: true, purchaseCost: true } },
            },
          },
          salesOrders: {
            select: { id: true, reference: true, fulfilmentStatus: true, paymentStatus: true },
          },
          customerPurchaseOrders: {
            select: { id: true, reference: true, customerReference: true, status: true },
          },
          events: { orderBy: { createdAt: "desc" }, take: 40 },
        },
      }),
    null,
  );
}

/** Headline counts for the requests queue. */
export async function quotationSummary() {
  return readMedical(
    async () => {
      const [newRequests, drafting, awaitingCustomer, accepted] = await Promise.all([
        medicalDb.quotationRequest.count({ where: { status: "NEW" } }),
        medicalDb.quotationRequest.count({ where: { status: { in: ["UNDER_REVIEW", "DRAFTING"] } } }),
        medicalDb.quotation.count({ where: { status: { in: ["ISSUED", "SENT", "VIEWED"] } } }),
        medicalDb.quotation.count({ where: { status: "ACCEPTED" } }),
      ]);
      return { newRequests, drafting, awaitingCustomer, accepted };
    },
    { newRequests: 0, drafting: 0, awaitingCustomer: 0, accepted: 0 },
  );
}

/** Products for the line picker, searched the way a laboratory searches. */
export async function searchProductsForQuotation(q: string) {
  if (!q.trim()) return [];
  return readMedical(
    () =>
      medicalDb.medicalProduct.findMany({
        where: {
          status: { in: ["ACTIVE", "OUT_OF_STOCK"] },
          OR: [
            { catalogueNumber: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          sku: true,
          name: true,
          catalogueNumber: true,
          price: true,
          purchaseCost: true,
          unitOfSale: true,
        },
        orderBy: { name: "asc" },
        take: 20,
      }),
    [],
  );
}
