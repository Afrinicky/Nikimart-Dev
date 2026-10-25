"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from ".prisma/medical-client";
import { medicalDb } from "@/lib/medical/db";
import { requireMedicalRole, type MedicalStaffSession } from "@/lib/medical/session";
import { recordAudit } from "@/lib/medical/audit";
import { nextReference } from "@/lib/medical/numbering";
import { setting } from "@/lib/medical/settings";
import { reserveStock, InsufficientStockError } from "@/lib/medical/inventory/stock";
import {
  basisPointsToDecimalString,
  percentToBasisPoints,
  toBasisPoints,
  toDecimalString,
  toPesewas,
} from "@/lib/medical/money";
import { priceDocument, type DiscountKind, type LineInput } from "@/lib/medical/quotations/pricing";
import { can, effectiveStatus, isQuotationStatus } from "@/lib/medical/quotations/status";

/**
 * Everything that writes on the quotation side.
 *
 * The rule the whole file is built around: **an issued document is frozen.**
 * Every action that touches lines, prices or terms asks `can(status, "EDIT")`
 * first, and the one that changes a price on an issued document does not exist
 * — `reviseQuotation` creates a new version instead, superseding the old one
 * with the reason recorded. A customer holding a copy of version 1 must always
 * be able to see the document we hold as version 1.
 *
 * Totals are server-computed, by `pricing.ts`, on every write. Nothing a
 * browser posts is trusted as a total: the form posts quantities, prices and
 * discounts, and the sum is recomputed here from those.
 */

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string) => toPesewas(text(f, k));
const int = (f: FormData, k: string, fallback = 0) => {
  const n = Number(text(f, k));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
};
const date = (f: FormData, k: string) => {
  const raw = text(f, k);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

function failed(error: unknown, fallback: string): ActionResult {
  if (error instanceof InsufficientStockError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

const REQUEST_STATUSES = [
  "NEW",
  "UNDER_REVIEW",
  "AWAITING_SUPPLIER",
  "DRAFTING",
  "SENT",
  "REVISION_REQUESTED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "CONVERTED",
  "CANCELLED",
];

/** A timeline entry, written in the same transaction as what it describes. */
async function note(
  tx: Prisma.TransactionClient,
  staff: MedicalStaffSession,
  entry: {
    requestId?: string | null;
    quotationId?: string | null;
    kind: string;
    summary: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.quotationEvent.create({
    data: {
      requestId: entry.requestId ?? null,
      quotationId: entry.quotationId ?? null,
      kind: entry.kind,
      summary: entry.summary,
      detail: JSON.stringify(entry.detail ?? {}),
      actorKind: "STAFF",
      actorId: staff.staffId,
      actorName: staff.name,
    },
  });
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** Take a request, or hand it to somebody else. */
export async function assignRequest(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("quotations", ["MANAGER", "SALES"]);
    const id = text(form, "requestId");
    // Blank means "me", which is what the button on the queue does.
    const assigneeId = text(form, "assigneeId") || staff.staffId;

    await medicalDb.$transaction(async (tx) => {
      const request = await tx.quotationRequest.findUniqueOrThrow({ where: { id } });
      const assignee = await tx.medicalStaff.findUniqueOrThrow({
        where: { id: assigneeId },
        select: { id: true, name: true, isActive: true },
      });
      if (!assignee.isActive) throw new Error("That colleague's access is suspended.");

      await tx.quotationRequest.update({
        where: { id },
        data: {
          assigneeId,
          // Taking a new request is itself the first review, so the status
          // moves with the assignment rather than needing a second click.
          status: request.status === "NEW" ? "UNDER_REVIEW" : request.status,
        },
      });
      await note(tx, staff, {
        requestId: id,
        kind: "ASSIGNED",
        summary:
          assigneeId === staff.staffId
            ? `${staff.name} took ${request.reference}`
            : `${request.reference} assigned to ${assignee.name}`,
      });
      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "QuotationRequest",
        entityId: id,
        summary: `Assigned ${request.reference} to ${assignee.name}`,
      });
    });

    revalidatePath("/medicals/admin/quotation-requests");
    revalidatePath(`/medicals/admin/quotation-requests/${id}`);
    return { ok: true };
  } catch (error) {
    return failed(error, "The request could not be assigned.");
  }
}

/** Move a request along, with the reason on the timeline. */
export async function setRequestStatus(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("quotations", ["MANAGER", "SALES"]);
    const id = text(form, "requestId");
    const status = text(form, "status");
    const why = text(form, "why");

    if (!REQUEST_STATUSES.includes(status)) return { ok: false, error: "Choose a status." };

    await medicalDb.$transaction(async (tx) => {
      const request = await tx.quotationRequest.findUniqueOrThrow({ where: { id } });
      if (request.status === status) throw new Error("It is already there.");

      const closing = ["DECLINED", "CANCELLED", "EXPIRED"].includes(status);
      if (closing && !why) throw new Error("Closing a request needs a reason.");

      await tx.quotationRequest.update({
        where: { id },
        data: { status, closedAt: closing ? new Date() : null },
      });
      await note(tx, staff, {
        requestId: id,
        kind: "STATUS_CHANGED",
        summary: `${human(request.status)} → ${human(status)}${why ? `: ${why}` : ""}`,
        detail: { before: request.status, after: status },
      });
      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "QuotationRequest",
        entityId: id,
        summary: `${request.reference}: ${human(request.status)} → ${human(status)}`,
      });
    });

    revalidatePath(`/medicals/admin/quotation-requests/${id}`);
    revalidatePath("/medicals/admin/quotation-requests");
    return { ok: true };
  } catch (error) {
    return failed(error, "The status could not be changed.");
  }
}

/**
 * Start a quotation from a request.
 *
 * Lines are copied from what the customer asked for, priced at the catalogue
 * price as a starting point — not as an answer. The cost is frozen onto each
 * line at the same moment, because margin reported next month against next
 * month's cost tells you what the sale *would* be worth if you made it again,
 * which is not the question.
 */
export async function draftQuotationFromRequest(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("quotations", ["MANAGER", "SALES"]);
    const requestId = text(form, "requestId");
    const documentType = text(form, "documentType") === "PROFORMA" ? "PROFORMA" : "QUOTATION";

    const validityDays = await setting<number>("quotation.validityDays", 30);
    const defaultTerms = await setting<string>("quotation.defaultPaymentTerms", "");

    const id = await medicalDb.$transaction(async (tx) => {
      const request = await tx.quotationRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: {
          items: {
            orderBy: { position: "asc" },
            include: {
              product: {
                select: { id: true, name: true, catalogueNumber: true, price: true, purchaseCost: true, unitOfSale: true },
              },
            },
          },
          organisation: { select: { id: true, name: true, email: true, phone: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
        },
      });

      // Its own series, because the prefix is how somebody tells the two
      // apart on a filing shelf: QT-2026-0147 is an offer, PI-2026-0032 is a
      // proforma a finance office is releasing funds against.
      const reference = await nextReference(tx, documentType === "PROFORMA" ? "PROFORMA" : "QUOTATION");
      const quotation = await tx.quotation.create({
        data: {
          reference,
          version: 1,
          requestId,
          customerId: request.customerId,
          organisationId: request.organisationId,
          documentType,
          status: "DRAFT",
          validUntil: new Date(Date.now() + Math.max(1, validityDays) * 86_400_000),
          // Copied, not joined: an institution that renames itself next year
          // must not rename itself on a document issued this year.
          billToName:
            request.organisation?.name || request.institutionName || request.contactName,
          billToContact: request.contactName,
          billToEmail:
            request.contactEmail || request.customer?.email || request.organisation?.email || "",
          billToPhone: request.contactPhone || request.customer?.phone || "",
          deliverToAddress: request.deliverTo,
          paymentTerms: defaultTerms,
          notes: request.notes,
        },
      });

      for (const [index, item] of request.items.entries()) {
        const unitPrice = toPesewas(item.product?.price ?? 0);
        await tx.quotationItem.create({
          data: {
            quotationId: quotation.id,
            productId: item.productId,
            // Their wording, not the catalogue's: they asked for something
            // specific and the person pricing it needs to see what.
            description: item.description || item.product?.name || "",
            catalogueNumber: item.catalogueNumber || item.product?.catalogueNumber || "",
            detail: item.notes,
            quantity: item.quantity,
            unit: item.unit || item.product?.unitOfSale || "unit",
            unitPrice: toDecimalString(unitPrice),
            lineTotal: toDecimalString(unitPrice * Math.max(0, item.quantity)),
            unitCostAtIssue: toDecimalString(toPesewas(item.product?.purchaseCost ?? 0)),
            isCustomLine: !item.productId,
            position: index * 10,
          },
        });
      }

      // A special request is a line somebody has to price by hand. Carried
      // across as a custom line rather than left in a notes field where the
      // person pricing it will miss it.
      if (request.specialRequest) {
        await tx.quotationItem.create({
          data: {
            quotationId: quotation.id,
            description: request.specialRequest,
            detail: "Asked for outside the catalogue — price by hand.",
            quantity: 1,
            unitPrice: "0",
            lineTotal: "0",
            isCustomLine: true,
            position: request.items.length * 10 + 10,
          },
        });
      }

      await recompute(tx, quotation.id);

      await tx.quotationRequest.update({
        where: { id: requestId },
        data: { status: "DRAFTING", assigneeId: request.assigneeId ?? staff.staffId },
      });
      await note(tx, staff, {
        requestId,
        quotationId: quotation.id,
        kind: "DRAFTED",
        summary: `Drafted ${reference} from ${request.reference}`,
      });
      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "Quotation",
        entityId: quotation.id,
        summary: `Drafted ${reference} (${documentType.toLowerCase()}) from ${request.reference}`,
      });

      return quotation.id;
    });

    revalidatePath("/medicals/admin/quotations");
    revalidatePath(`/medicals/admin/quotation-requests/${requestId}`);
    return { ok: true, id, message: "Drafted. Price the lines, then issue it." };
  } catch (error) {
    return failed(error, "The quotation could not be drafted.");
  }
}

// ---------------------------------------------------------------------------
// Quotations
// ---------------------------------------------------------------------------

/**
 * Save a draft: lines, discounts, charges and terms.
 *
 * Refused outright on anything but a draft. The form is not rendered for an
 * issued document either, but a form is a suggestion and the server decides.
 */
export async function saveQuotation(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("quotations", ["MANAGER", "SALES"]);
    const id = text(form, "quotationId");

    await medicalDb.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      guardEditable(quotation.status);

      for (const item of quotation.items) {
        const quantity = int(form, `qty:${item.id}`, item.quantity);
        // A quantity of zero removes the line. Deleting from a draft is safe —
        // nothing outside this document references it yet.
        if (quantity === 0) {
          await tx.quotationItem.delete({ where: { id: item.id } });
          continue;
        }
        await tx.quotationItem.update({
          where: { id: item.id },
          data: {
            description: text(form, `desc:${item.id}`) || item.description,
            detail: text(form, `detail:${item.id}`),
            quantity,
            unitPrice: toDecimalString(money(form, `price:${item.id}`)),
            discountKind: discountKindOf(text(form, `dkind:${item.id}`)),
            discountValue: discountValueFor(
              discountKindOf(text(form, `dkind:${item.id}`)),
              text(form, `dvalue:${item.id}`),
            ),
          },
        });
      }

      const docKind = discountKindOf(text(form, "discountKind"));
      await tx.quotation.update({
        where: { id },
        data: {
          discountKind: docKind,
          discountValue: discountValueFor(docKind, text(form, "discountValue")),
          deliveryCharge: toDecimalString(money(form, "deliveryCharge")),
          handlingCharge: toDecimalString(money(form, "handlingCharge")),
          otherCharge: toDecimalString(money(form, "otherCharge")),
          otherChargeLabel: text(form, "otherChargeLabel"),
          validUntil: date(form, "validUntil") ?? quotation.validUntil,
          paymentTerms: text(form, "paymentTerms"),
          deliveryEstimate: text(form, "deliveryEstimate"),
          notes: text(form, "notes"),
          termsAndConditions: text(form, "termsAndConditions"),
          billToName: text(form, "billToName") || quotation.billToName,
          billToContact: text(form, "billToContact"),
          billToEmail: text(form, "billToEmail"),
          billToPhone: text(form, "billToPhone"),
          billToAddress: text(form, "billToAddress"),
          billToTaxId: text(form, "billToTaxId"),
          deliverToAddress: text(form, "deliverToAddress"),
        },
      });

      await recompute(tx, id);
      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "Quotation",
        entityId: id,
        summary: `Priced ${quotation.reference} v${quotation.version}`,
      });
    });

    revalidatePath(`/medicals/admin/quotations/${id}`);
    return { ok: true, message: "Saved. Totals recomputed." };
  } catch (error) {
    return failed(error, "The quotation could not be saved.");
  }
}

/** Add a line to a draft — a catalogue product, or something typed by hand. */
export async function addQuotationLine(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("quotations", ["MANAGER", "SALES"]);
    const id = text(form, "quotationId");
    const productId = text(form, "productId") || null;
    const description = text(form, "description");

    await medicalDb.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUniqueOrThrow({
        where: { id },
        select: { id: true, status: true, reference: true, version: true },
      });
      guardEditable(quotation.status);

      const product = productId
        ? await tx.medicalProduct.findUniqueOrThrow({
            where: { id: productId },
            select: {
              id: true,
              name: true,
              catalogueNumber: true,
              price: true,
              purchaseCost: true,
              unitOfSale: true,
            },
          })
        : null;

      if (!product && !description) {
        throw new Error("Choose a product or describe the line.");
      }

      const last = await tx.quotationItem.findFirst({
        where: { quotationId: id },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const quantity = Math.max(1, int(form, "quantity", 1));
      const typedPrice = money(form, "unitPrice");
      const unitPrice = typedPrice > 0 ? typedPrice : toPesewas(product?.price ?? 0);

      await tx.quotationItem.create({
        data: {
          quotationId: id,
          productId: product?.id ?? null,
          description: description || product?.name || "",
          catalogueNumber: product?.catalogueNumber ?? "",
          detail: text(form, "detail"),
          quantity,
          unit: text(form, "unit") || product?.unitOfSale || "unit",
          unitPrice: toDecimalString(unitPrice),
          lineTotal: toDecimalString(unitPrice * quantity),
          unitCostAtIssue: toDecimalString(toPesewas(product?.purchaseCost ?? 0)),
          isCustomLine: !product,
          position: (last?.position ?? 0) + 10,
        },
      });

      await recompute(tx, id);
      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "Quotation",
        entityId: id,
        summary: `Added a line to ${quotation.reference} v${quotation.version}`,
      });
    });

    revalidatePath(`/medicals/admin/quotations/${id}`);
    return { ok: true, message: "Line added." };
  } catch (error) {
    return failed(error, "The line could not be added.");
  }
}

/**
 * Issue it. From here the document is frozen.
 *
 * A quotation with no priced line is refused: a document that offers something
 * at nothing is either a mistake or a gift, and both want somebody to say so
 * deliberately rather than by clicking past it.
 */
export async function issueQuotation(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("quotations", ["MANAGER", "SALES"]);
    const id = text(form, "quotationId");

    const reference = await medicalDb.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      const status = statusOf(quotation);
      if (!can(status, "ISSUE")) {
        throw new Error("Only a draft can be issued.");
      }
      if (quotation.items.length === 0) throw new Error("There is nothing on it.");

      const unpriced = quotation.items.filter((item) => toPesewas(item.unitPrice) <= 0);
      if (unpriced.length > 0) {
        throw new Error(
          `${unpriced.length} line${unpriced.length === 1 ? " has" : "s have"} no price. Price ${unpriced.length === 1 ? "it" : "them"}, or remove ${unpriced.length === 1 ? "it" : "them"}.`,
        );
      }
      if (!quotation.billToName) throw new Error("Say who it is addressed to.");

      const amounts = await recompute(tx, id);
      if (amounts.totalPayable <= 0) {
        throw new Error("The total comes to nothing. Check the discount.");
      }

      await tx.quotation.update({
        where: { id },
        data: { status: "ISSUED", issuedAt: new Date(), issuedById: staff.staffId },
      });
      await note(tx, staff, {
        requestId: quotation.requestId,
        quotationId: id,
        kind: "ISSUED",
        summary: `Issued ${quotation.reference} v${quotation.version}`,
      });
      await recordAudit(tx, staff, {
        action: "ISSUE",
        entity: "Quotation",
        entityId: id,
        summary: `Issued ${quotation.reference} v${quotation.version}`,
        changes: { totalPayable: amounts.totalPayable },
      });

      return `${quotation.reference} v${quotation.version}`;
    });

    revalidatePath(`/medicals/admin/quotations/${id}`);
    revalidatePath("/medicals/admin/quotations");
    return { ok: true, message: `${reference} issued. It is read-only from here.` };
  } catch (error) {
    return failed(error, "The quotation could not be issued.");
  }
}

/** Record that it has gone to the customer. */
export async function sendQuotation(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("quotations", ["MANAGER", "SALES"]);
    const id = text(form, "quotationId");
    const how = text(form, "how") || "EMAIL";

    await medicalDb.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUniqueOrThrow({ where: { id } });
      if (!can(statusOf(quotation), "SEND")) {
        throw new Error("Only an issued quotation can be sent.");
      }

      await tx.quotation.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date() },
      });
      if (quotation.requestId) {
        await tx.quotationRequest.update({
          where: { id: quotation.requestId },
          data: { status: "SENT" },
        });
      }
      await note(tx, staff, {
        requestId: quotation.requestId,
        quotationId: id,
        kind: "SENT",
        summary: `Sent ${quotation.reference} v${quotation.version} by ${how.toLowerCase()}`,
      });
      await recordAudit(tx, staff, {
        action: "SEND",
        entity: "Quotation",
        entityId: id,
        summary: `Sent ${quotation.reference} v${quotation.version}`,
      });
    });

    revalidatePath(`/medicals/admin/quotations/${id}`);
    revalidatePath("/medicals/admin/quotations");
    return { ok: true, message: "Recorded as sent." };
  } catch (error) {
    return failed(error, "It could not be recorded as sent.");
  }
}

/**
 * The customer's answer.
 *
 * Accepting does not create an order and does not reserve stock. An accepted
 * quotation is an agreement; the order is the commitment, and
 * `convertQuotation` is the deliberate step that makes it.
 */
export async function answerQuotation(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("quotations", ["MANAGER", "SALES"]);
    const id = text(form, "quotationId");
    const accept = text(form, "accept") === "1";
    const reason = text(form, "reason");

    if (!accept && !reason) {
      return { ok: false, error: "Record why they declined. It is the most useful field here." };
    }

    await medicalDb.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUniqueOrThrow({ where: { id } });
      const status = statusOf(quotation);
      if (!can(status, accept ? "ACCEPT" : "DECLINE")) {
        throw new Error(
          status === "EXPIRED"
            ? "That quotation has lapsed. Revise it and issue a new version."
            : "That cannot be answered in its current state.",
        );
      }

      await tx.quotation.update({
        where: { id },
        data: accept
          ? { status: "ACCEPTED", acceptedAt: new Date() }
          : { status: "DECLINED", declinedAt: new Date(), declineReason: reason },
      });
      if (quotation.requestId) {
        await tx.quotationRequest.update({
          where: { id: quotation.requestId },
          data: {
            status: accept ? "ACCEPTED" : "DECLINED",
            closedAt: accept ? null : new Date(),
          },
        });
      }
      await note(tx, staff, {
        requestId: quotation.requestId,
        quotationId: id,
        kind: accept ? "ACCEPTED" : "DECLINED",
        summary: accept
          ? `Accepted ${quotation.reference} v${quotation.version}`
          : `Declined ${quotation.reference} v${quotation.version}: ${reason}`,
      });
      await recordAudit(tx, staff, {
        action: accept ? "ACCEPT" : "REJECT",
        entity: "Quotation",
        entityId: id,
        summary: accept
          ? `Accepted ${quotation.reference} v${quotation.version}`
          : `Declined ${quotation.reference} v${quotation.version}: ${reason}`,
      });
    });

    revalidatePath(`/medicals/admin/quotations/${id}`);
    revalidatePath("/medicals/admin/quotations");
    return {
      ok: true,
      message: accept
        ? "Accepted. Nothing is reserved and nothing is owed until it becomes an order."
        : "Declined, with the reason recorded.",
    };
  } catch (error) {
    return failed(error, "The answer could not be recorded.");
  }
}

/**
 * A new version, superseding this one.
 *
 * How a price changes after a document has been issued. The old version is
 * marked `SUPERSEDED` and kept exactly as it was, because the customer has a
 * copy of it — and a revision that edited the original in place would make
 * their copy and ours disagree about what was offered.
 */
export async function reviseQuotation(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("quotations", ["MANAGER", "SALES"]);
    const id = text(form, "quotationId");
    const reason = text(form, "reason");
    if (!reason) return { ok: false, error: "Say why it is being revised. It goes on the record." };

    const validityDays = await setting<number>("quotation.validityDays", 30);

    const nextId = await medicalDb.$transaction(async (tx) => {
      const old = await tx.quotation.findUniqueOrThrow({
        where: { id },
        include: { items: { orderBy: { position: "asc" } } },
      });
      if (!can(statusOf(old), "REVISE")) {
        throw new Error("Only an issued or sent quotation can be revised.");
      }

      const created = await tx.quotation.create({
        data: {
          reference: old.reference,
          version: old.version + 1,
          requestId: old.requestId,
          customerId: old.customerId,
          organisationId: old.organisationId,
          documentType: old.documentType,
          status: "DRAFT",
          validUntil: new Date(Date.now() + Math.max(1, validityDays) * 86_400_000),
          billToName: old.billToName,
          billToContact: old.billToContact,
          billToEmail: old.billToEmail,
          billToPhone: old.billToPhone,
          billToAddress: old.billToAddress,
          billToTaxId: old.billToTaxId,
          deliverToAddress: old.deliverToAddress,
          currency: old.currency,
          discountKind: old.discountKind,
          discountValue: old.discountValue,
          deliveryCharge: old.deliveryCharge,
          handlingCharge: old.handlingCharge,
          otherCharge: old.otherCharge,
          otherChargeLabel: old.otherChargeLabel,
          taxLabel: old.taxLabel,
          taxRate: old.taxRate,
          paymentTerms: old.paymentTerms,
          deliveryEstimate: old.deliveryEstimate,
          notes: old.notes,
          termsAndConditions: old.termsAndConditions,
          templateId: old.templateId,
          supersedesId: old.id,
          revisionReason: reason,
        },
      });

      for (const item of old.items) {
        await tx.quotationItem.create({
          data: {
            quotationId: created.id,
            productId: item.productId,
            description: item.description,
            catalogueNumber: item.catalogueNumber,
            detail: item.detail,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discountKind: item.discountKind,
            discountValue: item.discountValue,
            // Re-frozen at this version's issue, not carried from the last:
            // the cost may have moved, and this version's margin is this
            // version's.
            unitCostAtIssue: item.productId
              ? toDecimalString(
                  toPesewas(
                    (
                      await tx.medicalProduct.findUnique({
                        where: { id: item.productId },
                        select: { purchaseCost: true },
                      })
                    )?.purchaseCost ?? item.unitCostAtIssue,
                  ),
                )
              : item.unitCostAtIssue,
            isCustomLine: item.isCustomLine,
            position: item.position,
          },
        });
      }

      await recompute(tx, created.id);
      await tx.quotation.update({ where: { id: old.id }, data: { status: "SUPERSEDED" } });
      if (old.requestId) {
        await tx.quotationRequest.update({
          where: { id: old.requestId },
          data: { status: "DRAFTING" },
        });
      }

      await note(tx, staff, {
        requestId: old.requestId,
        quotationId: created.id,
        kind: "REVISED",
        summary: `v${created.version} replaces v${old.version}: ${reason}`,
      });
      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "Quotation",
        entityId: created.id,
        summary: `Revised ${old.reference} to v${created.version}: ${reason}`,
      });

      return created.id;
    });

    revalidatePath("/medicals/admin/quotations");
    revalidatePath(`/medicals/admin/quotations/${id}`);
    return { ok: true, id: nextId, message: `New version drafted. The old one is kept as issued.` };
  } catch (error) {
    return failed(error, "The quotation could not be revised.");
  }
}

/**
 * Turn an accepted quotation into a sales order.
 *
 * This is where a sale begins. Stock is reserved for what the shelf can cover —
 * reserved, not deducted, because the goods are still on the shelf and the
 * delivery note is what says they have left. A shortfall is not a reason to
 * refuse: it is a procurement problem, and the order page opens a sourcing
 * round for it.
 */
export async function convertQuotation(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("quotations", ["MANAGER", "SALES"]);
    const id = text(form, "quotationId");

    const result = await medicalDb.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUniqueOrThrow({
        where: { id },
        include: { items: { orderBy: { position: "asc" } } },
      });
      if (!can(statusOf(quotation), "CONVERT")) {
        throw new Error("Only an accepted quotation becomes an order.");
      }
      // Counted rather than carried on the include: the guard has to hold
      // against a second click that arrives while the first is still in
      // flight, and the status check alone would let both through.
      const already = await tx.salesOrder.count({ where: { quotationId: id } });
      if (already > 0) {
        throw new Error("An order has already been raised from this quotation.");
      }

      const reference = await nextReference(tx, "ORDER");
      const payable = toPesewas(quotation.totalPayable);

      const order = await tx.salesOrder.create({
        data: {
          reference,
          channel: "QUOTATION",
          customerId: quotation.customerId,
          organisationId: quotation.organisationId,
          quotationId: quotation.id,
          fulfilmentStatus: "CONFIRMED",
          paymentStatus: "UNPAID",
          confirmedAt: new Date(),
          currency: quotation.currency,
          subtotal: quotation.subtotal,
          discountAmount: quotation.discountAmount,
          deliveryCharge: quotation.deliveryCharge,
          handlingCharge: quotation.handlingCharge,
          otherCharge: quotation.otherCharge,
          taxAmount: quotation.taxAmount,
          totalOutright: quotation.totalOutright,
          totalPayable: quotation.totalPayable,
          balanceDue: toDecimalString(payable),
          customerNote: quotation.notes,
          internalNote: quotation.paymentTerms
            ? `Payment terms: ${quotation.paymentTerms}`
            : "",
          deliverySnapshot: quotation.deliverToAddress,
        },
      });

      let shortLines = 0;
      for (const [index, item] of quotation.items.entries()) {
        const orderItem = await tx.salesOrderItem.create({
          data: {
            salesOrderId: order.id,
            productId: item.productId,
            description: item.description,
            catalogueNumber: item.catalogueNumber,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            lineTotal: item.lineTotal,
            unitCost: item.unitCostAtIssue,
            position: index * 10,
          },
        });

        if (!item.productId) {
          shortLines += 1;
          continue;
        }
        const product = await tx.medicalProduct.findUniqueOrThrow({
          where: { id: item.productId },
          select: { stockOnHand: true, stockReserved: true },
        });
        const free = Math.max(0, product.stockOnHand - product.stockReserved);
        const toReserve = Math.min(free, item.quantity);
        if (toReserve > 0) {
          await reserveStock(tx, item.productId, toReserve, {
            sourceType: "SALES_ORDER",
            sourceId: order.id,
            staffId: staff.staffId,
            reason: `Reserved for ${reference}`,
          });
          await tx.salesOrderItem.update({
            where: { id: orderItem.id },
            data: { quantityReserved: toReserve },
          });
        }
        if (toReserve < item.quantity) shortLines += 1;
      }

      await tx.quotation.update({ where: { id }, data: { status: "CONVERTED" } });
      if (quotation.requestId) {
        await tx.quotationRequest.update({
          where: { id: quotation.requestId },
          data: { status: "CONVERTED", closedAt: new Date() },
        });
      }
      await note(tx, staff, {
        requestId: quotation.requestId,
        quotationId: id,
        kind: "CONVERTED",
        summary: `Converted to ${reference}`,
      });
      await recordAudit(tx, staff, {
        action: "ACCEPT",
        entity: "Quotation",
        entityId: id,
        summary: `Converted ${quotation.reference} v${quotation.version} to ${reference}`,
      });

      return { orderId: order.id, reference, shortLines };
    });

    revalidatePath(`/medicals/admin/quotations/${id}`);
    revalidatePath("/medicals/admin/customer-orders");
    return {
      ok: true,
      id: result.orderId,
      message:
        result.shortLines > 0
          ? `${result.reference} raised. ${result.shortLines} line${result.shortLines === 1 ? "" : "s"} cannot be filled from stock — open a sourcing request.`
          : `${result.reference} raised and stock reserved. Nothing is paid or dispatched.`,
    };
  } catch (error) {
    return failed(error, "The quotation could not be converted.");
  }
}

/** Cancel a quotation, with the reason on the timeline. */
export async function cancelQuotation(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("quotations", ["MANAGER", "SALES"]);
    const id = text(form, "quotationId");
    const reason = text(form, "reason");
    if (!reason) return { ok: false, error: "Give a reason." };

    await medicalDb.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUniqueOrThrow({ where: { id } });
      if (!can(statusOf(quotation), "CANCEL")) {
        throw new Error("That quotation cannot be cancelled in its current state.");
      }
      await tx.quotation.update({ where: { id }, data: { status: "CANCELLED" } });
      await note(tx, staff, {
        requestId: quotation.requestId,
        quotationId: id,
        kind: "STATUS_CHANGED",
        summary: `Cancelled: ${reason}`,
      });
      await recordAudit(tx, staff, {
        action: "CANCEL",
        entity: "Quotation",
        entityId: id,
        summary: `Cancelled ${quotation.reference} v${quotation.version}: ${reason}`,
      });
    });

    revalidatePath(`/medicals/admin/quotations/${id}`);
    revalidatePath("/medicals/admin/quotations");
    return { ok: true };
  } catch (error) {
    return failed(error, "The quotation could not be cancelled.");
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Recompute and store every total on a quotation.
 *
 * Called by every write. Totals are never taken from the form: the browser
 * posts quantities, prices and discounts, and the arithmetic is done here by
 * the tested module — so a document's figures cannot be whatever somebody's
 * devtools posted.
 */
async function recompute(tx: Prisma.TransactionClient, quotationId: string) {
  const quotation = await tx.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { items: { orderBy: { position: "asc" } } },
  });

  const lines: LineInput[] = quotation.items.map((item) => ({
    quantity: item.quantity,
    unitPrice: toPesewas(item.unitPrice),
    discountKind: item.discountKind as DiscountKind,
    discountValue:
      item.discountKind === "PERCENT"
        ? toBasisPoints(item.discountValue)
        : toPesewas(item.discountValue),
  }));

  const amounts = priceDocument({
    lines,
    discountKind: quotation.discountKind as DiscountKind,
    discountValue:
      quotation.discountKind === "PERCENT"
        ? toBasisPoints(quotation.discountValue)
        : toPesewas(quotation.discountValue),
    deliveryCharge: toPesewas(quotation.deliveryCharge),
    handlingCharge: toPesewas(quotation.handlingCharge),
    otherCharge: toPesewas(quotation.otherCharge),
    taxRate: toBasisPoints(quotation.taxRate),
    planUpliftRate: toBasisPoints(quotation.planUpliftRate),
    depositRate: toBasisPoints(quotation.depositRate),
  });

  for (const [index, item] of quotation.items.entries()) {
    const line = amounts.lines[index];
    await tx.quotationItem.update({
      where: { id: item.id },
      data: {
        discountAmount: toDecimalString(line.discount),
        lineTotal: toDecimalString(line.total),
      },
    });
  }

  await tx.quotation.update({
    where: { id: quotationId },
    data: {
      subtotal: toDecimalString(amounts.subtotal),
      discountAmount: toDecimalString(amounts.discountAmount),
      taxAmount: toDecimalString(amounts.taxAmount),
      totalOutright: toDecimalString(amounts.totalOutright),
      planUpliftAmount: toDecimalString(amounts.planUpliftAmount),
      totalPayable: toDecimalString(amounts.totalPayable),
      depositAmount: toDecimalString(amounts.depositAmount),
    },
  });

  return amounts;
}

function discountKindOf(value: string): DiscountKind {
  return value === "PERCENT" || value === "AMOUNT" ? value : "NONE";
}

/** A percent discount is stored as a rate; an amount as money. */
function discountValueFor(kind: DiscountKind, raw: string): string {
  if (kind === "PERCENT") return basisPointsToDecimalString(percentToBasisPoints(raw));
  if (kind === "AMOUNT") return toDecimalString(toPesewas(raw));
  return "0";
}

function statusOf(quotation: { status: string; validUntil: Date | null }) {
  return effectiveStatus(quotation);
}

function guardEditable(status: string): void {
  const effective = isQuotationStatus(status) ? status : "DRAFT";
  if (!can(effective, "EDIT")) {
    throw new Error(
      "That document has been issued, so it is read-only. Revise it to change a price — the customer has a copy of this version.",
    );
  }
}

function human(status: string): string {
  const words = status.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
