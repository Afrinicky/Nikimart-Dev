import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";

/**
 * Reading the selling side, and the bridge between it and the buying side.
 *
 * Customer orders, the sourcing rounds they open when the shelf cannot cover
 * them, and the supplier replies to those rounds. Costs appear here only
 * because a sourcing round is an internal document — a customer never reaches
 * any of these functions, and nothing in this module is imported by a
 * storefront route.
 */

// ---------------------------------------------------------------------------
// Customer orders
// ---------------------------------------------------------------------------

export async function listSalesOrders(filters: {
  q?: string;
  fulfilment?: string;
  payment?: string;
  skip?: number;
  take?: number;
}) {
  const where = {
    ...(filters.fulfilment ? { fulfilmentStatus: filters.fulfilment } : {}),
    ...(filters.payment ? { paymentStatus: filters.payment } : {}),
    ...(filters.q
      ? {
          OR: [
            { reference: { contains: filters.q, mode: "insensitive" as const } },
            { customerNote: { contains: filters.q, mode: "insensitive" as const } },
            { organisation: { name: { contains: filters.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  return readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.salesOrder.findMany({
          where,
          select: {
            id: true,
            reference: true,
            channel: true,
            fulfilmentStatus: true,
            paymentStatus: true,
            placedAt: true,
            currency: true,
            totalPayable: true,
            balanceDue: true,
            walkInName: true,
            organisation: { select: { id: true, name: true } },
            customer: { select: { id: true, name: true } },
            _count: { select: { items: true, sourcingRequests: true } },
          },
          orderBy: { placedAt: "desc" },
          skip: filters.skip ?? 0,
          take: filters.take ?? 25,
        }),
        medicalDb.salesOrder.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );
}

export async function getSalesOrder(id: string) {
  return readMedical(
    () =>
      medicalDb.salesOrder.findUnique({
        where: { id },
        include: {
          organisation: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
          customerPurchaseOrder: {
            select: { id: true, reference: true, customerReference: true, status: true },
          },
          quotation: { select: { id: true, reference: true } },
          items: {
            orderBy: { position: "asc" },
            include: {
              product: {
                select: { id: true, sku: true, stockOnHand: true, stockReserved: true },
              },
            },
          },
          sourcingRequests: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              reference: true,
              status: true,
              priority: true,
              createdAt: true,
              _count: { select: { items: true, supplierQuotes: true } },
            },
          },
          payments: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              reference: true,
              amount: true,
              method: true,
              status: true,
              paidAt: true,
            },
          },
        },
      }),
    null,
  );
}

// ---------------------------------------------------------------------------
// Sourcing rounds
// ---------------------------------------------------------------------------

export async function listSourcingRequests(filters: {
  q?: string;
  status?: string;
  reason?: string;
  skip?: number;
  take?: number;
}) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.reason ? { reason: filters.reason } : {}),
    ...(filters.q
      ? {
          OR: [
            { reference: { contains: filters.q, mode: "insensitive" as const } },
            { salesOrder: { reference: { contains: filters.q, mode: "insensitive" as const } } },
            {
              items: {
                some: { description: { contains: filters.q, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
  };

  return readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.sourcingRequest.findMany({
          where,
          select: {
            id: true,
            reference: true,
            reason: true,
            status: true,
            priority: true,
            neededBy: true,
            createdAt: true,
            salesOrder: { select: { id: true, reference: true } },
            tender: { select: { id: true, reference: true } },
            _count: { select: { items: true, supplierQuotes: true } },
          },
          // Open rounds first: this list is a queue, and the thing a buyer
          // opens it for is what still has to be bought.
          orderBy: [{ createdAt: "desc" }],
          skip: filters.skip ?? 0,
          take: filters.take ?? 25,
        }),
        medicalDb.sourcingRequest.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );
}

export async function getSourcingRequest(id: string) {
  return readMedical(
    () =>
      medicalDb.sourcingRequest.findUnique({
        where: { id },
        include: {
          salesOrder: {
            select: {
              id: true,
              reference: true,
              fulfilmentStatus: true,
              organisation: { select: { name: true } },
            },
          },
          tender: { select: { id: true, reference: true, title: true } },
          items: {
            orderBy: { position: "asc" },
            include: {
              product: { select: { id: true, sku: true, name: true, unitOfSale: true } },
              purchaseOrderItems: {
                select: {
                  id: true,
                  quantity: true,
                  quantityReceived: true,
                  purchaseOrder: {
                    select: { id: true, reference: true, status: true },
                  },
                },
              },
            },
          },
          supplierQuotes: {
            orderBy: { requestedAt: "desc" },
            include: {
              supplier: { select: { id: true, name: true, kind: true, currency: true } },
              items: {
                select: {
                  id: true,
                  description: true,
                  quantity: true,
                  unitCost: true,
                  leadTimeDays: true,
                },
              },
            },
          },
        },
      }),
    null,
  );
}

/** Suppliers who have not yet been asked for prices on this round. */
export async function suppliersNotYetAsked(sourcingRequestId: string) {
  return readMedical(async () => {
    const asked = await medicalDb.supplierQuote.findMany({
      where: { sourcingRequestId },
      select: { supplierId: true },
    });
    return medicalDb.supplier.findMany({
      where: {
        isActive: true,
        id: { notIn: asked.map((row) => row.supplierId) },
      },
      select: { id: true, name: true, kind: true, currency: true, leadTimeDays: true },
      orderBy: { name: "asc" },
      take: 200,
    });
  }, []);
}

// ---------------------------------------------------------------------------
// Supplier quotations
// ---------------------------------------------------------------------------

export async function listSupplierQuotes(filters: {
  q?: string;
  status?: string;
  supplierId?: string;
  skip?: number;
  take?: number;
}) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.q
      ? {
          OR: [
            { reference: { contains: filters.q, mode: "insensitive" as const } },
            { supplier: { name: { contains: filters.q, mode: "insensitive" as const } } },
            {
              sourcingRequest: {
                reference: { contains: filters.q, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  return readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.supplierQuote.findMany({
          where,
          select: {
            id: true,
            reference: true,
            status: true,
            requestedAt: true,
            receivedAt: true,
            validUntil: true,
            currency: true,
            exchangeRate: true,
            freight: true,
            insurance: true,
            otherCharges: true,
            dutyRateBp: true,
            clearingGhs: true,
            otherGhs: true,
            supplier: { select: { id: true, name: true, kind: true } },
            sourcingRequest: { select: { id: true, reference: true } },
            items: { select: { id: true, quantity: true, unitCost: true, leadTimeDays: true } },
          },
          orderBy: { requestedAt: "desc" },
          skip: filters.skip ?? 0,
          take: filters.take ?? 25,
        }),
        medicalDb.supplierQuote.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );
}
