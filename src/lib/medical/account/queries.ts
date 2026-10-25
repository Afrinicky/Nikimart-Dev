import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";
import {
  PUBLIC_PRODUCT_SELECT,
  toProductSummary,
  type ProductSummary,
} from "@/lib/medical/catalogue";
import { toPesewas, type Pesewas } from "@/lib/medical/money";

/**
 * What a customer can see of their own dealings with this business.
 *
 * Everything here is scoped by `customerId` in the query itself rather than
 * filtered afterwards — the row a customer may not read should never be
 * fetched, so that a mistake in a component cannot become a disclosure.
 *
 * Money crosses as pesewas, never as a Prisma `Decimal`: a Decimal handed to a
 * client component is a serialisation error at render time, and converting at
 * the boundary is the one place it can be done once.
 */

export interface SavedProduct extends ProductSummary {
  savedAt: Date;
}

export async function getSavedProducts(customerId: string): Promise<SavedProduct[]> {
  return readMedical(async () => {
    const rows = await medicalDb.wishlistItem.findMany({
      where: { customerId, product: { status: "ACTIVE" } },
      select: { createdAt: true, product: { select: PUBLIC_PRODUCT_SELECT } },
      orderBy: { createdAt: "desc" },
      take: 96,
    });
    return rows.map((row) => ({
      ...toProductSummary(row.product as never),
      savedAt: row.createdAt,
    }));
  }, []);
}

/**
 * The ids this customer has saved, for drawing the save control in its right
 * state. One query for a whole page of products rather than one per card.
 */
export async function getSavedProductIds(customerId: string | null): Promise<Set<string>> {
  if (!customerId) return new Set();
  return readMedical(async () => {
    const rows = await medicalDb.wishlistItem.findMany({
      where: { customerId },
      select: { productId: true },
    });
    return new Set(rows.map((row) => row.productId));
  }, new Set<string>());
}

export interface AccountRequest {
  id: string;
  reference: string;
  status: string;
  submittedAt: Date;
  lineCount: number;
  /** The link a customer follows to read it; see QuotationRequest.accessToken. */
  accessToken: string;
  quotationCount: number;
}

export interface AccountQuotation {
  id: string;
  reference: string;
  version: number;
  status: string;
  issuedAt: Date | null;
  validUntil: Date | null;
  total: Pesewas;
  requestToken: string | null;
}

export interface AccountOrder {
  id: string;
  reference: string;
  fulfilmentStatus: string;
  paymentStatus: string;
  placedAt: Date;
  total: Pesewas;
  outstanding: Pesewas;
}

export interface AccountSummary {
  requests: AccountRequest[];
  quotations: AccountQuotation[];
  orders: AccountOrder[];
}

export async function getAccountSummary(customerId: string): Promise<AccountSummary> {
  return readMedical(
    async () => {
      const [requests, quotations, orders] = await Promise.all([
        medicalDb.quotationRequest.findMany({
          where: { customerId },
          select: {
            id: true,
            reference: true,
            status: true,
            submittedAt: true,
            accessToken: true,
            _count: { select: { items: true, quotations: true } },
          },
          orderBy: { submittedAt: "desc" },
          take: 10,
        }),
        // Drafts are the business's working copy, not a document the customer
        // has been given. Nothing unissued is listed.
        medicalDb.quotation.findMany({
          where: { customerId, status: { not: "DRAFT" } },
          select: {
            id: true,
            reference: true,
            version: true,
            status: true,
            issuedAt: true,
            validUntil: true,
            totalPayable: true,
            request: { select: { accessToken: true } },
          },
          orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
          take: 10,
        }),
        medicalDb.salesOrder.findMany({
          where: { customerId },
          select: {
            id: true,
            reference: true,
            fulfilmentStatus: true,
            paymentStatus: true,
            placedAt: true,
            totalPayable: true,
            balanceDue: true,
          },
          orderBy: { placedAt: "desc" },
          take: 10,
        }),
      ]);

      return {
        requests: requests.map((row) => ({
          id: row.id,
          reference: row.reference,
          status: row.status,
          submittedAt: row.submittedAt,
          lineCount: row._count.items,
          accessToken: row.accessToken,
          quotationCount: row._count.quotations,
        })),
        quotations: quotations.map((row) => ({
          id: row.id,
          reference: row.reference,
          version: row.version,
          status: row.status,
          issuedAt: row.issuedAt,
          validUntil: row.validUntil,
          total: toPesewas(row.totalPayable as never),
          requestToken: row.request?.accessToken ?? null,
        })),
        orders: orders.map((row) => ({
          id: row.id,
          reference: row.reference,
          fulfilmentStatus: row.fulfilmentStatus,
          paymentStatus: row.paymentStatus,
          placedAt: row.placedAt,
          total: toPesewas(row.totalPayable as never),
          // `balanceDue` is stored rather than derived here: it is
          // totalPayable − amountPaid + amountRefunded, and the settlement
          // module owns that arithmetic.
          outstanding: Math.max(0, toPesewas(row.balanceDue as never)),
        })),
      };
    },
    { requests: [], quotations: [], orders: [] },
  );
}
