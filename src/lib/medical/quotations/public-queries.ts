import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { toPesewas, type Pesewas } from "@/lib/medical/money";

/**
 * What a customer may read about their own request.
 *
 * The token is the authorisation and the only one: `QuotationRequest.
 * accessToken` is a cuid, unguessable, and handed out once when the request is
 * made. That is deliberate — a hospital's procurement officer forwards the
 * link to the person who holds the budget, and that person does not have an
 * account.
 *
 * Which means the select here is the security boundary. Nothing internal
 * crosses it: no assignee, no internal notes, no cost, no margin, and no
 * draft. A draft quotation is the business's working copy and a customer
 * looking at one would be reading a price nobody has agreed to yet.
 */

export interface PublicRequestLine {
  id: string;
  description: string;
  catalogueNumber: string;
  quantity: number;
  unit: string;
  notes: string;
  productSlug: string | null;
}

export interface PublicQuotation {
  id: string;
  reference: string;
  version: number;
  status: string;
  issuedAt: Date | null;
  validUntil: Date | null;
  currency: string;
  subtotal: Pesewas;
  discountAmount: Pesewas;
  deliveryCharge: Pesewas;
  handlingCharge: Pesewas;
  otherCharge: Pesewas;
  taxAmount: Pesewas;
  total: Pesewas;
  paymentTerms: string;
  deliveryEstimate: string;
  notes: string;
  termsAndConditions: string;
  lines: {
    id: string;
    description: string;
    detail: string;
    catalogueNumber: string;
    quantity: number;
    unit: string;
    unitPrice: Pesewas;
    lineTotal: Pesewas;
  }[];
}

export interface PublicRequest {
  reference: string;
  status: string;
  submittedAt: Date;
  requiredBy: Date | null;
  deliverTo: string;
  notes: string;
  specialRequest: string;
  contactName: string;
  institutionName: string;
  lines: PublicRequestLine[];
  quotations: PublicQuotation[];
}

export async function getRequestByToken(token: string): Promise<PublicRequest | null> {
  const clean = token.trim();
  if (!clean || clean.length > 64) return null;

  return readMedical(async () => {
    const row = await medicalDb.quotationRequest.findUnique({
      where: { accessToken: clean },
      select: {
        reference: true,
        status: true,
        submittedAt: true,
        requiredBy: true,
        deliverTo: true,
        notes: true,
        specialRequest: true,
        contactName: true,
        institutionName: true,
        items: {
          select: {
            id: true,
            description: true,
            catalogueNumber: true,
            quantity: true,
            unit: true,
            notes: true,
            product: { select: { slug: true, status: true } },
          },
          orderBy: { position: "asc" },
        },
        quotations: {
          where: { status: { not: "DRAFT" } },
          select: {
            id: true,
            reference: true,
            version: true,
            status: true,
            issuedAt: true,
            validUntil: true,
            currency: true,
            subtotal: true,
            discountAmount: true,
            deliveryCharge: true,
            handlingCharge: true,
            otherCharge: true,
            taxAmount: true,
            totalPayable: true,
            paymentTerms: true,
            deliveryEstimate: true,
            notes: true,
            termsAndConditions: true,
            items: {
              select: {
                id: true,
                description: true,
                detail: true,
                catalogueNumber: true,
                quantity: true,
                unit: true,
                unitPrice: true,
                lineTotal: true,
              },
              orderBy: { position: "asc" },
            },
          },
          orderBy: [{ version: "desc" }],
        },
      },
    });

    if (!row) return null;

    return {
      reference: row.reference,
      status: row.status,
      submittedAt: row.submittedAt,
      requiredBy: row.requiredBy,
      deliverTo: row.deliverTo,
      notes: row.notes,
      specialRequest: row.specialRequest,
      contactName: row.contactName,
      institutionName: row.institutionName,
      lines: row.items.map((item) => ({
        id: item.id,
        description: item.description,
        catalogueNumber: item.catalogueNumber,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes,
        // Only a product somebody can still open is linked.
        productSlug: item.product?.status === "ACTIVE" ? item.product.slug : null,
      })),
      quotations: row.quotations.map((quotation) => ({
        id: quotation.id,
        reference: quotation.reference,
        version: quotation.version,
        status: quotation.status,
        issuedAt: quotation.issuedAt,
        validUntil: quotation.validUntil,
        currency: quotation.currency,
        subtotal: toPesewas(quotation.subtotal as never),
        discountAmount: toPesewas(quotation.discountAmount as never),
        deliveryCharge: toPesewas(quotation.deliveryCharge as never),
        handlingCharge: toPesewas(quotation.handlingCharge as never),
        otherCharge: toPesewas(quotation.otherCharge as never),
        taxAmount: toPesewas(quotation.taxAmount as never),
        total: toPesewas(quotation.totalPayable as never),
        paymentTerms: quotation.paymentTerms,
        deliveryEstimate: quotation.deliveryEstimate,
        notes: quotation.notes,
        termsAndConditions: quotation.termsAndConditions,
        lines: quotation.items.map((item) => ({
          id: item.id,
          description: item.description,
          detail: item.detail,
          catalogueNumber: item.catalogueNumber,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: toPesewas(item.unitPrice as never),
          lineTotal: toPesewas(item.lineTotal as never),
        })),
      })),
    };
  }, null);
}
