import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { toPesewas, type Pesewas } from "@/lib/medical/money";

/**
 * The figures on the console overview.
 *
 * Every one of them is a query. There is no sample data path, no "example"
 * fallback and no estimate dressed up as a measurement: a card with nothing
 * behind it renders a zero and says so, because a dashboard that opens on
 * invented numbers is one nobody can trust afterwards — and the first wrong
 * figure costs the credibility of every right one beside it.
 *
 * Read in one `Promise.all` because they are independent and the page should
 * wait for the slowest rather than for the sum.
 */

export interface OverviewFigures {
  /** Things waiting on somebody here. */
  quotationRequestsNew: number;
  quotationsAwaitingReply: number;
  customerPosToReview: number;
  tendersDueSoon: number;
  sourcingOpen: number;
  purchaseOrdersAwaitingApproval: number;
  purchaseOrdersOverdue: number;
  invoicesWithDiscrepancies: number;
  /** Money. */
  outstandingReceivable: Pesewas;
  outstandingPayable: Pesewas;
  /** Stock. */
  lowStockLines: number;
  expiringBatches: number;
}

export async function getOverviewFigures(): Promise<OverviewFigures> {
  const now = new Date();
  const inThirtyDays = new Date(now);
  inThirtyDays.setDate(inThirtyDays.getDate() + 30);
  const inNinetyDays = new Date(now);
  inNinetyDays.setDate(inNinetyDays.getDate() + 90);

  return readMedical(
    async () => {
      const [
        quotationRequestsNew,
        quotationsAwaitingReply,
        customerPosToReview,
        tendersDueSoon,
        sourcingOpen,
        purchaseOrdersAwaitingApproval,
        purchaseOrdersOverdue,
        invoicesWithDiscrepancies,
        receivable,
        payableInvoices,
        lowStock,
        expiringBatches,
      ] = await Promise.all([
        medicalDb.quotationRequest.count({ where: { status: "NEW" } }),
        medicalDb.quotation.count({ where: { status: { in: ["SENT", "VIEWED"] } } }),
        medicalDb.customerPurchaseOrder.count({
          where: { status: { in: ["RECEIVED", "UNDER_REVIEW"] } },
        }),
        medicalDb.tender.count({
          where: {
            status: { in: ["IDENTIFIED", "PREPARING"] },
            submissionDeadline: { gte: now, lte: inThirtyDays },
          },
        }),
        medicalDb.sourcingRequest.count({ where: { status: { in: ["OPEN", "QUOTING"] } } }),
        medicalDb.purchaseOrder.count({ where: { status: "DRAFT" } }),
        medicalDb.purchaseOrder.count({
          where: {
            status: { in: ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] },
            expectedAt: { lt: now },
          },
        }),
        medicalDb.supplierInvoice.count({
          where: { discrepancyKind: { not: "NONE" }, isMatched: false },
        }),
        // What customers owe. Summed over the stored balance rather than
        // recomputed from payments, which is why that column is stored.
        medicalDb.salesOrder.aggregate({
          where: { paymentStatus: { in: ["UNPAID", "DEPOSIT_PAID", "PARTIALLY_PAID"] } },
          _sum: { balanceDue: true },
        }),
        medicalDb.supplierInvoice.findMany({
          where: { status: { in: ["AWAITING_PAYMENT", "PARTIALLY_PAID"] } },
          select: { amountGhs: true, amountPaid: true },
        }),
        // A product is low when free stock is at or under its reorder level and
        // somebody set a reorder level at all. Compared column-to-column, which
        // Prisma cannot express, so it is one small raw query rather than
        // reading every product into memory.
        medicalDb.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count
          FROM "medical_products"
          WHERE "status" = 'ACTIVE'
            AND "reorderLevel" > 0
            AND ("stockOnHand" - "stockReserved") <= "reorderLevel"
        `,
        medicalDb.stockBatch.count({
          where: {
            quantityRemaining: { gt: 0 },
            expiryDate: { not: null, gte: now, lte: inNinetyDays },
          },
        }),
      ]);

      const outstandingPayable = payableInvoices.reduce(
        (total, invoice) => total + (toPesewas(invoice.amountGhs) - toPesewas(invoice.amountPaid)),
        0,
      );

      return {
        quotationRequestsNew,
        quotationsAwaitingReply,
        customerPosToReview,
        tendersDueSoon,
        sourcingOpen,
        purchaseOrdersAwaitingApproval,
        purchaseOrdersOverdue,
        invoicesWithDiscrepancies,
        outstandingReceivable: toPesewas(receivable._sum.balanceDue),
        outstandingPayable,
        lowStockLines: Number(lowStock[0]?.count ?? 0),
        expiringBatches,
      };
    },
    {
      quotationRequestsNew: 0,
      quotationsAwaitingReply: 0,
      customerPosToReview: 0,
      tendersDueSoon: 0,
      sourcingOpen: 0,
      purchaseOrdersAwaitingApproval: 0,
      purchaseOrdersOverdue: 0,
      invoicesWithDiscrepancies: 0,
      outstandingReceivable: 0,
      outstandingPayable: 0,
      lowStockLines: 0,
      expiringBatches: 0,
    },
  );
}

/**
 * Tender deadlines and renewals worth knowing about.
 *
 * This is what a "reminder" is in a console somebody opens every morning: the
 * thing on the first screen, not an email they will archive. A scheduled
 * notification sweep can be layered on later and read the same query.
 */
export async function getUpcomingTenderDates(limit = 6) {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 60);

  return readMedical(
    () =>
      medicalDb.tender.findMany({
        where: {
          OR: [
            {
              status: { in: ["IDENTIFIED", "PREPARING", "SUBMITTED"] },
              submissionDeadline: { gte: now, lte: horizon },
            },
            {
              renewalDueAt: { gte: now, lte: horizon },
            },
          ],
        },
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          submissionDeadline: true,
          renewalDueAt: true,
          organisation: { select: { name: true } },
        },
        orderBy: [{ submissionDeadline: "asc" }, { renewalDueAt: "asc" }],
        take: limit,
      }),
    [],
  );
}
