import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { toPesewas, type MoneyInput } from "@/lib/medical/money";
import { summarise, type OutcomeLine, type TenderOutcome } from "@/lib/medical/tenders/status";
import { stateOf, type RegisterEntry, type RegisterState } from "@/lib/medical/tenders/register";

/** Reading the tender desk. Internal throughout. */

export async function listTenders(filters: {
  q?: string;
  status?: string;
  organisationId?: string;
  skip?: number;
  take?: number;
}) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.organisationId ? { organisationId: filters.organisationId } : {}),
    ...(filters.q
      ? {
          OR: [
            { reference: { contains: filters.q, mode: "insensitive" as const } },
            { tenderNumber: { contains: filters.q, mode: "insensitive" as const } },
            { title: { contains: filters.q, mode: "insensitive" as const } },
            { organisation: { name: { contains: filters.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  return readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.tender.findMany({
          where,
          select: {
            id: true,
            reference: true,
            tenderNumber: true,
            title: true,
            status: true,
            cycle: true,
            submissionDeadline: true,
            contractEndAt: true,
            renewalDueAt: true,
            estimatedValue: true,
            organisation: { select: { id: true, name: true } },
            owner: { select: { name: true } },
            _count: { select: { items: true, submissions: true } },
          },
          // Soonest deadline first: a tender desk is a queue ordered by date,
          // not by when somebody happened to key the record in.
          orderBy: [{ submissionDeadline: "asc" }, { createdAt: "desc" }],
          skip: filters.skip ?? 0,
          take: filters.take ?? 25,
        }),
        medicalDb.tender.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );
}

export async function getTender(id: string) {
  return readMedical(
    () =>
      medicalDb.tender.findUnique({
        where: { id },
        include: {
          organisation: true,
          owner: { select: { id: true, name: true } },
          items: {
            include: { product: { select: { id: true, name: true, sku: true, unitOfSale: true } } },
            orderBy: { position: "asc" },
          },
          documents: { orderBy: { position: "asc" } },
          submissions: {
            include: {
              items: {
                include: { tenderItem: { select: { lotNumber: true, description: true } } },
                orderBy: { position: "asc" },
              },
            },
            orderBy: { version: "desc" },
          },
          events: { orderBy: { createdAt: "desc" }, take: 30 },
        },
      }),
    null,
  );
}

/** The outcome of a tender, computed from the latest submission's lines. */
export function outcomeOf(submissionItems: readonly {
  outcome: string;
  isNoBid: boolean;
  quantity: number;
  awardedQuantity: number;
  // MoneyInput rather than unknown: a Decimal column satisfies it structurally
  // — it stringifies to its exact value — so no cast is needed anywhere, and
  // passing something that is not money is a compile error rather than a zero.
  unitPrice: MoneyInput;
  awardedUnitPrice: MoneyInput;
  unitCostAtBid: MoneyInput;
}[]): TenderOutcome {
  const lines: OutcomeLine[] = submissionItems.map((item) => ({
    outcome: item.outcome as OutcomeLine["outcome"],
    isNoBid: item.isNoBid,
    quantity: item.quantity,
    awardedQuantity: item.awardedQuantity,
    unitPrice: toPesewas(item.unitPrice),
    awardedUnitPrice: toPesewas(item.awardedUnitPrice),
    unitCostAtBid: toPesewas(item.unitCostAtBid),
  }));
  return summarise(lines);
}

// ---------------------------------------------------------------------------
// The approved-product register
// ---------------------------------------------------------------------------

export interface RegisterRow extends RegisterEntry {
  organisationId: string;
  organisationName: string;
  productName: string;
  sourceKind: string;
  tenderReference: string | null;
  tenderId: string | null;
  paymentTerms: string;
  deliveryTerms: string;
  state: RegisterState;
}

/**
 * What we are approved to supply, with each row's real state worked out.
 *
 * The state is derived on read rather than trusted from the column: a row that
 * lapsed overnight would otherwise still read as live until somebody ran a
 * job, and the first person to see it would quote against it.
 */
export async function listApprovedProducts(filters: {
  organisationId?: string;
  productId?: string;
  usableOnly?: boolean;
  q?: string;
  skip?: number;
  take?: number;
}): Promise<{ rows: RegisterRow[]; total: number }> {
  const where = {
    ...(filters.organisationId ? { organisationId: filters.organisationId } : {}),
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.q
      ? {
          OR: [
            { description: { contains: filters.q, mode: "insensitive" as const } },
            { organisation: { name: { contains: filters.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  return readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.approvedProduct.findMany({
          where,
          include: {
            organisation: { select: { id: true, name: true } },
            product: { select: { name: true } },
            tender: { select: { id: true, reference: true } },
          },
          orderBy: [{ validUntil: "asc" }, { createdAt: "desc" }],
          skip: filters.skip ?? 0,
          take: filters.take ?? 50,
        }),
        medicalDb.approvedProduct.count({ where }),
      ]);

      const mapped = rows.map((row): RegisterRow => {
        const entry: RegisterEntry = {
          id: row.id,
          productId: row.productId,
          description: row.description,
          unitPrice: toPesewas(row.unitPrice),
          unit: row.unit,
          quantityAwarded: row.quantityAwarded,
          quantityDrawn: row.quantityDrawn,
          minimumOrderQuantity: row.minimumOrderQuantity,
          leadTimeDays: row.leadTimeDays,
          validFrom: row.validFrom,
          validUntil: row.validUntil,
          status: row.status as RegisterEntry["status"],
        };
        return {
          ...entry,
          organisationId: row.organisationId,
          organisationName: row.organisation.name,
          productName: row.product?.name ?? row.description,
          sourceKind: row.sourceKind,
          tenderReference: row.tender?.reference ?? null,
          tenderId: row.tender?.id ?? null,
          paymentTerms: row.paymentTerms,
          deliveryTerms: row.deliveryTerms,
          state: stateOf(entry),
        };
      });

      const filtered = filters.usableOnly ? mapped.filter((row) => row.state.isUsable) : mapped;
      return { rows: filtered, total: filters.usableOnly ? filtered.length : total };
    },
    { rows: [], total: 0 },
  );
}

/**
 * The live award for a product at an institution, if there is one.
 *
 * What the quotation editor calls to put the banner up. It surfaces the award
 * and the terms; it does not apply them. Applying a price automatically means
 * a lapsed or superseded award silently misprices a document before anybody
 * looks at it, and the admin should see *why* the price is what it is.
 */
export async function approvedPriceFor(
  organisationId: string,
  productId: string,
): Promise<RegisterRow | null> {
  const { rows } = await listApprovedProducts({ organisationId, productId, take: 20 });
  const usable = rows
    .filter((row) => row.state.isUsable)
    .sort((a, b) => {
      const aEnds = a.validUntil?.getTime() ?? Number.POSITIVE_INFINITY;
      const bEnds = b.validUntil?.getTime() ?? Number.POSITIVE_INFINITY;
      return aEnds - bEnds || a.unitPrice - b.unitPrice;
    });
  return usable[0] ?? null;
}
