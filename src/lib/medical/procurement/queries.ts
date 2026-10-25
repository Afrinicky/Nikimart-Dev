import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { toPesewas, type Pesewas } from "@/lib/medical/money";
import { matchInvoice, outstandingOn, type InvoiceMatch } from "@/lib/medical/procurement/matching";
import { compareOffers, type Comparison, type Offer } from "@/lib/medical/procurement/landed-cost";
import { toBasisPoints } from "@/lib/medical/money";

/**
 * Reading the procurement side of the business.
 *
 * Everything here is internal: suppliers, what they charge, what we owe them.
 * None of it has a customer-facing counterpart and none of these functions may
 * ever be called from a storefront route — the privacy boundary the catalogue
 * module enforces in its select is enforced here by the module simply not
 * being reachable from `/medicals` outside `/admin`.
 */

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export interface SupplierListFilters {
  q?: string;
  kind?: string;
  active?: string;
  skip?: number;
  take?: number;
}

export async function listSuppliers(filters: SupplierListFilters) {
  const where = {
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.active === "0" ? { isActive: false } : filters.active === "1" ? { isActive: true } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" as const } },
            { code: { contains: filters.q, mode: "insensitive" as const } },
            { contactName: { contains: filters.q, mode: "insensitive" as const } },
            { email: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  return readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.supplier.findMany({
          where,
          select: {
            id: true,
            code: true,
            name: true,
            kind: true,
            country: true,
            currency: true,
            contactName: true,
            email: true,
            phone: true,
            leadTimeDays: true,
            paymentTermsDays: true,
            isActive: true,
            _count: { select: { purchaseOrders: true, products: true } },
          },
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          skip: filters.skip ?? 0,
          take: filters.take ?? 25,
        }),
        medicalDb.supplier.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );
}

/** What a supplier has cost us, and what we still owe them. */
export async function getSupplierBalance(
  supplierId: string,
): Promise<{ invoiced: Pesewas; paid: Pesewas; outstanding: Pesewas; openOrders: number }> {
  return readMedical(
    async () => {
      const [invoices, openOrders] = await Promise.all([
        medicalDb.supplierInvoice.findMany({
          where: { supplierId, status: { notIn: ["CANCELLED", "DRAFT"] } },
          select: { amountGhs: true, amountPaid: true },
        }),
        medicalDb.purchaseOrder.count({
          where: { supplierId, status: { in: ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] } },
        }),
      ]);

      const invoiced = invoices.reduce((t, i) => t + toPesewas(i.amountGhs), 0);
      const paid = invoices.reduce((t, i) => t + toPesewas(i.amountPaid), 0);
      return { invoiced, paid, outstanding: outstandingOn(invoiced, paid), openOrders };
    },
    { invoiced: 0, paid: 0, outstanding: 0, openOrders: 0 },
  );
}

export async function getSupplier(id: string) {
  return readMedical(
    () =>
      medicalDb.supplier.findUnique({
        where: { id },
        include: {
          purchaseOrders: {
            select: {
              id: true,
              reference: true,
              status: true,
              orderedAt: true,
              expectedAt: true,
              currency: true,
              totalLandedGhs: true,
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          invoices: {
            select: {
              id: true,
              reference: true,
              supplierReference: true,
              status: true,
              issuedAt: true,
              dueAt: true,
              amountGhs: true,
              amountPaid: true,
              discrepancyKind: true,
            },
            orderBy: { issuedAt: "desc" },
            take: 10,
          },
        },
      }),
    null,
  );
}

// ---------------------------------------------------------------------------
// Supplier quotations
// ---------------------------------------------------------------------------

/**
 * The replies to one sourcing round, costed and ranked.
 *
 * This is the comparison the brief asks for: total expected acquisition cost
 * rather than unit price. The arithmetic lives in `landed-cost.ts` and is
 * tested; this function only feeds it.
 */
export async function compareQuotesForSourcing(
  sourcingRequestId: string,
): Promise<Comparison & { quotes: { id: string; reference: string; supplierName: string }[] }> {
  const empty = {
    ranked: [],
    best: null,
    cheapestByUnitPrice: null,
    savingAgainstUnitPriceChoice: 0,
    hasEstimates: false,
    quotes: [],
  };

  return readMedical(async () => {
    const quotes = await medicalDb.supplierQuote.findMany({
      where: { sourcingRequestId, status: { in: ["RECEIVED", "REQUESTED"] } },
      include: {
        supplier: { select: { id: true, name: true, kind: true } },
        items: { select: { id: true, quantity: true, unitCost: true, leadTimeDays: true } },
      },
    });

    const offers: Offer[] = quotes.map((quote) => {
      const statedCharges =
        toPesewas(quote.freight) +
        toPesewas(quote.insurance) +
        toPesewas(quote.otherCharges) +
        toPesewas(quote.clearingGhs) +
        toPesewas(quote.otherGhs);

      return {
        id: quote.id,
        supplierId: quote.supplier.id,
        supplierName: quote.supplier.name,
        currency: quote.currency,
        exchangeRate: toBasisPoints(quote.exchangeRate),
        lines: quote.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unitPrice: toPesewas(item.unitCost),
        })),
        // Freight, insurance and their other charges as the supplier stated
        // them, in the supplier's own currency; duty as a rate on the CIF
        // value; clearing and the inland charges in GH₵, because they are paid
        // here in cedis.
        freight: toPesewas(quote.freight),
        insurance: toPesewas(quote.insurance),
        otherSupplierCharges: toPesewas(quote.otherCharges),
        dutyRate: quote.dutyRateBp,
        clearingGhs: toPesewas(quote.clearingGhs),
        otherGhs: toPesewas(quote.otherGhs),
        leadTimeDays: Math.max(0, ...quote.items.map((item) => item.leadTimeDays), 0),
        // A local quote with no charges on it is fully costed: there is nothing
        // between their gate and ours to cost. An import quote with none stated
        // is not, and the difference matters — freight, duty and clearing on an
        // import are certainly not zero, they are merely unknown, and a ranking
        // that treats unknown as zero puts the wrong supplier first.
        costsConfirmed:
          quote.status === "RECEIVED" &&
          (quote.supplier.kind !== "INTERNATIONAL" || statedCharges > 0 || quote.dutyRateBp > 0),
      };
    });

    // A request that has been sent and not yet answered is not an offer, and
    // ranking it at zero would make every comparison name it the cheapest.
    // Kept in `quotes` so the screen can still show it as outstanding.
    const priced = offers.filter((offer) =>
      offer.lines.some((line) => line.quantity > 0 && line.unitPrice > 0),
    );

    return {
      ...compareOffers(priced),
      quotes: quotes.map((q) => ({
        id: q.id,
        reference: q.reference,
        supplierName: q.supplier.name,
      })),
    };
  }, empty);
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

export async function listPurchaseOrders(filters: {
  q?: string;
  status?: string;
  supplierId?: string;
  overdue?: string;
  skip?: number;
  take?: number;
}) {
  const now = new Date();
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.overdue === "1"
      ? {
          status: { in: ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] },
          expectedAt: { lt: now },
        }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { reference: { contains: filters.q, mode: "insensitive" as const } },
            { supplier: { name: { contains: filters.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  return readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.purchaseOrder.findMany({
          where,
          select: {
            id: true,
            reference: true,
            status: true,
            orderedAt: true,
            expectedAt: true,
            currency: true,
            subtotal: true,
            totalLandedGhs: true,
            costsConfirmed: true,
            supplier: { select: { id: true, name: true, kind: true } },
            _count: { select: { items: true, receipts: true } },
          },
          orderBy: [{ createdAt: "desc" }],
          skip: filters.skip ?? 0,
          take: filters.take ?? 25,
        }),
        medicalDb.purchaseOrder.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );
}

export async function getPurchaseOrder(id: string) {
  return readMedical(
    () =>
      medicalDb.purchaseOrder.findUnique({
        where: { id },
        include: {
          supplier: true,
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, unitOfSale: true } },
              sourcingRequestItem: {
                select: {
                  id: true,
                  sourcingRequest: { select: { id: true, reference: true, salesOrderId: true } },
                },
              },
            },
            orderBy: { id: "asc" },
          },
          receipts: {
            include: { items: true },
            orderBy: { receivedAt: "desc" },
          },
          invoices: {
            select: {
              id: true,
              reference: true,
              supplierReference: true,
              status: true,
              amountGhs: true,
              amountPaid: true,
              discrepancyKind: true,
              isMatched: true,
            },
          },
        },
      }),
    null,
  );
}

/** How much of each ordered line has actually been accepted so far. */
export async function receivedQuantities(
  purchaseOrderId: string,
): Promise<Map<string, { accepted: number; rejected: number }>> {
  const result = new Map<string, { accepted: number; rejected: number }>();
  const rows = await readMedical(
    () =>
      medicalDb.goodsReceiptItem.findMany({
        where: { goodsReceipt: { purchaseOrderId } },
        select: {
          purchaseOrderItemId: true,
          quantityAccepted: true,
          quantityRejected: true,
        },
      }),
    [],
  );

  for (const row of rows) {
    const current = result.get(row.purchaseOrderItemId) ?? { accepted: 0, rejected: 0 };
    current.accepted += row.quantityAccepted;
    current.rejected += row.quantityRejected;
    result.set(row.purchaseOrderItemId, current);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Supplier invoices
// ---------------------------------------------------------------------------

export async function listSupplierInvoices(filters: {
  q?: string;
  status?: string;
  discrepancy?: string;
  supplierId?: string;
  skip?: number;
  take?: number;
}) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.discrepancy === "1" ? { discrepancyKind: { not: "NONE" }, isMatched: false } : {}),
    ...(filters.q
      ? {
          OR: [
            { reference: { contains: filters.q, mode: "insensitive" as const } },
            { supplierReference: { contains: filters.q, mode: "insensitive" as const } },
            { supplier: { name: { contains: filters.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  return readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.supplierInvoice.findMany({
          where,
          select: {
            id: true,
            reference: true,
            supplierReference: true,
            status: true,
            issuedAt: true,
            dueAt: true,
            currency: true,
            amount: true,
            amountGhs: true,
            amountPaid: true,
            discrepancyKind: true,
            isMatched: true,
            supplier: { select: { id: true, name: true } },
            purchaseOrder: { select: { id: true, reference: true } },
          },
          orderBy: [{ issuedAt: "desc" }],
          skip: filters.skip ?? 0,
          take: filters.take ?? 25,
        }),
        medicalDb.supplierInvoice.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );
}

export async function getSupplierInvoice(
  id: string,
): Promise<{ invoice: NonNullable<Awaited<ReturnType<typeof loadInvoice>>>; match: InvoiceMatch } | null> {
  const invoice = await loadInvoice(id);
  if (!invoice) return null;

  const match = matchInvoice(
    invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      purchaseOrderItemId: item.purchaseOrderItemId,
      quantityOrdered: item.quantityOrdered,
      quantityAccepted: item.quantityAccepted,
      quantityInvoiced: item.quantityInvoiced,
      unitCostOrdered: toPesewas(item.unitCostOrdered),
      unitPriceInvoiced: toPesewas(item.unitPrice),
      taxInvoiced: toPesewas(item.taxAmount),
      taxExpected: 0,
    })),
  );

  return { invoice, match };
}

function loadInvoice(id: string) {
  return readMedical(
    () =>
      medicalDb.supplierInvoice.findUnique({
        where: { id },
        include: {
          supplier: { select: { id: true, name: true, currency: true, paymentTermsDays: true } },
          purchaseOrder: { select: { id: true, reference: true, currency: true } },
          items: { orderBy: { position: "asc" } },
          payments: { orderBy: { paidAt: "desc" } },
        },
      }),
    null,
  );
}
