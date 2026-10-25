"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from ".prisma/medical-client";
import { medicalDb } from "@/lib/medical/db";
import { requireMedicalRole } from "@/lib/medical/session";
import { recordAudit } from "@/lib/medical/audit";
import { nextReference } from "@/lib/medical/numbering";
import { mayDeriveStatus, summarise, type OutcomeLine } from "@/lib/medical/tenders/status";
import { lineAmount, sum, toDecimalString, toPesewas } from "@/lib/medical/money";

/**
 * Everything that writes on the tender desk.
 *
 * Same three rules as the procurement actions: one transaction per business
 * event, authorisation checked at the write rather than at the button, and an
 * audit row inside the same transaction.
 *
 * One rule of its own: **an award never creates a sale.** Recording that a
 * hospital awarded us eleven lines writes register entries and nothing else.
 * No order, no invoice, no revenue. The hospital still has to raise a purchase
 * order against the award, and that is a separate document with its own
 * review.
 */

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

function failed(error: unknown, fallback: string): ActionResult {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { ok: false, error: "Something with that reference already exists." };
  }
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = Number(String(f.get(k) ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(v) ? v : 0;
};
const money = (f: FormData, k: string) => toPesewas(text(f, k));
const date = (f: FormData, k: string) => {
  const raw = text(f, k);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ---------------------------------------------------------------------------
// The tender itself
// ---------------------------------------------------------------------------

export async function saveTender(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("tenders");
    const id = text(form, "id");
    const title = text(form, "title");
    const organisationId = text(form, "organisationId");
    if (!title) return { ok: false, error: "Give the tender a title." };
    if (!organisationId) return { ok: false, error: "Choose the institution running it." };

    const data = {
      organisationId,
      title,
      tenderNumber: text(form, "tenderNumber"),
      description: text(form, "description"),
      kind: text(form, "kind") || "OPEN",
      cycle: text(form, "cycle"),
      advertisedAt: date(form, "advertisedAt"),
      submissionDeadline: date(form, "submissionDeadline"),
      opensAt: date(form, "opensAt"),
      awardExpectedAt: date(form, "awardExpectedAt"),
      contractStartAt: date(form, "contractStartAt"),
      contractEndAt: date(form, "contractEndAt"),
      renewalDueAt: date(form, "renewalDueAt"),
      currency: text(form, "currency") || "GHS",
      estimatedValue: toDecimalString(money(form, "estimatedValue")),
      sourcedVia: text(form, "sourcedVia"),
      portalUrl: text(form, "portalUrl"),
      bidCost: toDecimalString(money(form, "bidCost")),
      notes: text(form, "notes"),
      internalNotes: text(form, "internalNotes"),
      ownerId: text(form, "ownerId") || staff.staffId,
    };

    const result = await medicalDb.$transaction(async (tx) => {
      if (id) {
        const before = await tx.tender.findUniqueOrThrow({ where: { id } });
        const row = await tx.tender.update({ where: { id }, data });

        // Dates moving is the change worth a timeline entry of its own: a
        // deadline that shifted and nobody noticed is a bid not submitted.
        if (
          before.submissionDeadline?.getTime() !== row.submissionDeadline?.getTime() ||
          before.renewalDueAt?.getTime() !== row.renewalDueAt?.getTime()
        ) {
          await tx.tenderEvent.create({
            data: {
              tenderId: id,
              kind: "DATE_CHANGED",
              summary: "Key dates changed",
              detail: JSON.stringify({
                submissionDeadline: {
                  before: before.submissionDeadline,
                  after: row.submissionDeadline,
                },
                renewalDueAt: { before: before.renewalDueAt, after: row.renewalDueAt },
              }),
              actorId: staff.staffId,
              actorName: staff.name,
            },
          });
        }

        await recordAudit(tx, staff, {
          action: "UPDATE",
          entity: "Tender",
          entityId: id,
          summary: `Updated ${before.reference}`,
        });
        return row;
      }

      const reference = await nextReference(tx, "TENDER");
      const row = await tx.tender.create({ data: { ...data, reference, status: "IDENTIFIED" } });
      await tx.tenderEvent.create({
        data: {
          tenderId: row.id,
          kind: "CREATED",
          summary: `Recorded ${reference}`,
          actorId: staff.staffId,
          actorName: staff.name,
        },
      });
      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "Tender",
        entityId: row.id,
        summary: `Recorded tender ${reference}: ${title}`,
      });
      return row;
    });

    revalidatePath("/medicals/admin/tenders");
    return { ok: true, id: result.id };
  } catch (error) {
    return failed(error, "The tender could not be saved.");
  }
}

/** A line as the institution published it. Their words, their lot number. */
export async function addTenderItem(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("tenders");
    const tenderId = text(form, "tenderId");
    const description = text(form, "description");
    if (!tenderId || !description) return { ok: false, error: "A line needs a description." };

    await medicalDb.$transaction(async (tx) => {
      const last = await tx.tenderItem.findFirst({
        where: { tenderId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const brands = text(form, "acceptableBrands")
        .split(",")
        .map((brand) => brand.trim())
        .filter(Boolean);

      await tx.tenderItem.create({
        data: {
          tenderId,
          lotNumber: text(form, "lotNumber"),
          position: (last?.position ?? -10) + 10,
          description,
          specification: text(form, "specification"),
          acceptableBrands: JSON.stringify(brands),
          quantity: Math.max(1, num(form, "quantity")),
          unit: text(form, "unit") || "unit",
          minimumShelfLifeMonths: Math.max(0, num(form, "minimumShelfLifeMonths")),
          requiredDeliveryDays: Math.max(0, num(form, "requiredDeliveryDays")),
          conditions: text(form, "conditions"),
          productId: text(form, "productId") || null,
        },
      });

      await tx.tender.update({
        where: { id: tenderId },
        data: { status: "PREPARING" },
      });

      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "TenderItem",
        entityId: tenderId,
        summary: `Added requirement "${description}"`,
      });
    });

    revalidatePath(`/medicals/admin/tenders/${tenderId}`);
    return { ok: true };
  } catch (error) {
    return failed(error, "The line could not be added.");
  }
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

/**
 * Start a submission against a tender.
 *
 * Pre-filled with one line per published requirement, each marked no-bid until
 * somebody prices it. Starting from the institution's list rather than from
 * nothing is what stops a line being missed, and a missed line on a forty-line
 * schedule is usually the one they most wanted.
 */
export async function createTenderSubmission(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("tenders");
    const tenderId = text(form, "tenderId");

    const submissionId = await medicalDb.$transaction(async (tx) => {
      const tender = await tx.tender.findUniqueOrThrow({
        where: { id: tenderId },
        include: {
          items: { include: { product: { select: { price: true, purchaseCost: true } } } },
          submissions: { orderBy: { version: "desc" }, take: 1 },
        },
      });
      if (tender.items.length === 0) {
        throw new Error("Add the published requirements before preparing a submission.");
      }

      const previous = tender.submissions[0];
      const version = (previous?.version ?? 0) + 1;
      const reference = previous?.reference ?? (await nextReference(tx, "TENDER_SUBMISSION"));

      const submission = await tx.tenderSubmission.create({
        data: {
          reference,
          version,
          tenderId,
          status: "DRAFT",
          currency: tender.currency,
          validUntil: date(form, "validUntil"),
          deliveryTerms: text(form, "deliveryTerms"),
          paymentTerms: text(form, "paymentTerms"),
          supersedesId: previous?.id ?? null,
          revisionReason: previous ? text(form, "revisionReason") : "",
        },
      });

      if (previous) {
        await tx.tenderSubmission.update({
          where: { id: previous.id },
          data: { status: "SUPERSEDED" },
        });
      }

      for (const [index, item] of tender.items.entries()) {
        await tx.tenderSubmissionItem.create({
          data: {
            submissionId: submission.id,
            tenderItemId: item.id,
            productId: item.productId,
            offeredDescription: item.description,
            quantity: item.quantity,
            unit: item.unit,
            // Catalogue price as a starting point, not a decision. Tender
            // pricing is nearly always below list, and the person bidding sets
            // it line by line.
            unitPrice: item.product?.price ?? "0",
            lineTotal: "0",
            unitCostAtBid: item.product?.purchaseCost ?? "0",
            // Carried across from the published requirement so the person
            // pricing can see what shelf life was asked for without opening
            // the tender beside it.
            shelfLifeMonths: item.minimumShelfLifeMonths,
            leadTimeDays: item.requiredDeliveryDays,
            // Everything starts as a no-bid, so a line nobody priced is
            // recorded as declined rather than submitted at the list price.
            isNoBid: true,
            position: index * 10,
          },
        });
      }

      await tx.tender.update({ where: { id: tenderId }, data: { status: "PREPARING" } });
      await tx.tenderEvent.create({
        data: {
          tenderId,
          kind: "DRAFTED",
          summary: `Started submission version ${version}`,
          actorId: staff.staffId,
          actorName: staff.name,
        },
      });
      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "TenderSubmission",
        entityId: submission.id,
        summary: `Started ${reference} v${version}`,
      });

      return submission.id;
    });

    revalidatePath(`/medicals/admin/tenders/${tenderId}`);
    return { ok: true, id: submissionId };
  } catch (error) {
    return failed(error, "The submission could not be started.");
  }
}

/** Price one line of a submission, or decline it. */
export async function priceSubmissionItem(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("tenders");
    const itemId = text(form, "itemId");
    const isNoBid = text(form, "isNoBid") === "1";
    const quantity = Math.max(0, num(form, "quantity"));
    const unitPrice = money(form, "unitPrice");

    const submissionId = await medicalDb.$transaction(async (tx) => {
      const item = await tx.tenderSubmissionItem.findUniqueOrThrow({
        where: { id: itemId },
        select: { id: true, submissionId: true, submission: { select: { status: true } } },
      });
      // An issued submission is a document that has been evaluated. Editing it
      // in place would change what the institution is holding.
      if (item.submission.status !== "DRAFT") {
        throw new Error("This submission has been sent. Start a revision instead.");
      }

      await tx.tenderSubmissionItem.update({
        where: { id: itemId },
        data: {
          isNoBid,
          noBidReason: isNoBid ? text(form, "noBidReason") : "",
          offeredDescription: text(form, "offeredDescription") || undefined,
          offeredBrand: text(form, "offeredBrand"),
          offeredSpecification: text(form, "offeredSpecification"),
          deviationNote: text(form, "deviationNote"),
          quantity,
          unitPrice: toDecimalString(unitPrice),
          lineTotal: toDecimalString(isNoBid ? 0 : lineAmount(quantity, unitPrice)),
          leadTimeDays: Math.max(0, num(form, "leadTimeDays")),
          shelfLifeMonths: Math.max(0, num(form, "shelfLifeMonths")),
          unitCostAtBid: toDecimalString(money(form, "unitCostAtBid")),
        },
      });

      await recalculateSubmission(tx, item.submissionId);
      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "TenderSubmissionItem",
        entityId: itemId,
        summary: isNoBid ? "Declined a line" : "Priced a line",
      });
      return item.submissionId;
    });

    revalidatePath(`/medicals/admin/tenders`);
    return { ok: true, id: submissionId };
  } catch (error) {
    return failed(error, "The line could not be saved.");
  }
}

async function recalculateSubmission(
  tx: Prisma.TransactionClient,
  submissionId: string,
): Promise<void> {
  const items = await tx.tenderSubmissionItem.findMany({
    where: { submissionId },
    select: { isNoBid: true, quantity: true, unitPrice: true, unitCostAtBid: true },
  });
  const bid = items.filter((item) => !item.isNoBid);

  await tx.tenderSubmission.update({
    where: { id: submissionId },
    data: {
      totalOffered: toDecimalString(
        sum(bid.map((item) => lineAmount(item.quantity, toPesewas(item.unitPrice)))),
      ),
      totalCostAtBid: toDecimalString(
        sum(bid.map((item) => lineAmount(item.quantity, toPesewas(item.unitCostAtBid)))),
      ),
    },
  });
}

/** Mark a submission as actually sent. */
export async function submitTender(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("tenders");
    const submissionId = text(form, "submissionId");

    const tenderId = await medicalDb.$transaction(async (tx) => {
      const submission = await tx.tenderSubmission.findUniqueOrThrow({
        where: { id: submissionId },
        include: { items: { select: { isNoBid: true } }, tender: { select: { id: true, documents: true } } },
      });
      if (submission.status !== "DRAFT") throw new Error("This submission has already been sent.");
      if (submission.items.every((item) => item.isNoBid)) {
        throw new Error("Every line is marked no-bid. Price at least one before submitting.");
      }

      // A required document that is not attached is the commonest reason a
      // prepared bid is thrown out unread, so it stops the submission here
      // rather than being discovered at the opening.
      const missing = submission.tender.documents.filter(
        (doc) => doc.isRequired && !doc.isProvided,
      );
      if (missing.length > 0) {
        throw new Error(
          `Still missing: ${missing.map((d) => d.label).join(", ")}. Attach them or mark them not required.`,
        );
      }

      await tx.tenderSubmission.update({
        where: { id: submissionId },
        data: {
          status: "SUBMITTED",
          submittedAt: date(form, "submittedAt") ?? new Date(),
          submittedById: staff.staffId,
          method: text(form, "method") || "HAND_DELIVERY",
          receiptReference: text(form, "receiptReference"),
        },
      });

      await tx.tender.update({
        where: { id: submission.tender.id },
        data: { status: "SUBMITTED" },
      });
      await tx.tenderEvent.create({
        data: {
          tenderId: submission.tender.id,
          kind: "SUBMITTED",
          summary: `Submitted ${submission.reference} v${submission.version}`,
          actorId: staff.staffId,
          actorName: staff.name,
        },
      });
      await recordAudit(tx, staff, {
        action: "SEND",
        entity: "TenderSubmission",
        entityId: submissionId,
        summary: `Submitted ${submission.reference} v${submission.version}`,
      });

      return submission.tender.id;
    });

    revalidatePath(`/medicals/admin/tenders/${tenderId}`);
    return { ok: true };
  } catch (error) {
    return failed(error, "The submission could not be sent.");
  }
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

/**
 * Record what came back, line by line.
 *
 * The important one. An award writes a register entry — permission to supply
 * at a price for a period — and **nothing else**. No sales order, no invoice,
 * no revenue. The institution still has to raise a purchase order against the
 * award, which is reviewed on its own and is where a sale actually begins.
 *
 * The tender's own status is recomputed from its lines afterwards rather than
 * being set here, so it can never disagree with them.
 */
export async function recordTenderOutcome(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("tenders");
    const submissionId = text(form, "submissionId");

    const tenderId = await medicalDb.$transaction(async (tx) => {
      const submission = await tx.tenderSubmission.findUniqueOrThrow({
        where: { id: submissionId },
        include: {
          items: true,
          tender: {
            select: {
              id: true,
              reference: true,
              organisationId: true,
              contractStartAt: true,
              contractEndAt: true,
            },
          },
        },
      });

      const awardedAt = date(form, "awardedAt") ?? new Date();
      let registerEntries = 0;

      for (const item of submission.items) {
        const outcome = String(form.get(`outcome:${item.id}`) ?? "").trim();
        if (!outcome) continue;

        const awardedQuantity = Math.max(
          0,
          Math.trunc(Number(form.get(`awardedQuantity:${item.id}`) ?? 0)),
        );
        const awardedUnitPrice = toPesewas(String(form.get(`awardedPrice:${item.id}`) ?? ""));

        await tx.tenderSubmissionItem.update({
          where: { id: item.id },
          data: {
            outcome,
            awardedQuantity,
            awardedUnitPrice: toDecimalString(
              awardedUnitPrice > 0 ? awardedUnitPrice : toPesewas(item.unitPrice),
            ),
            awardedAt: outcome === "AWARDED" || outcome === "PARTIALLY_AWARDED" ? awardedAt : null,
            awardedToOther: String(form.get(`awardedToOther:${item.id}`) ?? "").trim(),
            outcomeNote: String(form.get(`outcomeNote:${item.id}`) ?? "").trim(),
          },
        });

        if ((outcome === "AWARDED" || outcome === "PARTIALLY_AWARDED") && !item.isNoBid) {
          const price = awardedUnitPrice > 0 ? awardedUnitPrice : toPesewas(item.unitPrice);
          const quantity = awardedQuantity > 0 ? awardedQuantity : item.quantity;

          await tx.approvedProduct.create({
            data: {
              organisationId: submission.tender.organisationId,
              productId: item.productId,
              description: item.offeredDescription,
              sourceKind: "TENDER",
              tenderId: submission.tender.id,
              submissionItemId: item.id,
              unitPrice: toDecimalString(price),
              currency: submission.currency,
              unit: item.unit,
              quantityAwarded: quantity,
              leadTimeDays: item.leadTimeDays,
              paymentTerms: submission.paymentTerms,
              deliveryTerms: submission.deliveryTerms,
              validFrom: submission.tender.contractStartAt ?? awardedAt,
              validUntil: submission.tender.contractEndAt ?? submission.validUntil,
              status: "ACTIVE",
            },
          });
          registerEntries += 1;
        }
      }

      // Recomputed, never typed. A status that disagrees with its lines is a
      // pipeline figure nobody can use.
      const items = await tx.tenderSubmissionItem.findMany({
        where: { submissionId },
        select: {
          outcome: true,
          isNoBid: true,
          quantity: true,
          awardedQuantity: true,
          unitPrice: true,
          awardedUnitPrice: true,
          unitCostAtBid: true,
        },
      });
      const lines: OutcomeLine[] = items.map((row) => ({
        outcome: row.outcome as OutcomeLine["outcome"],
        isNoBid: row.isNoBid,
        quantity: row.quantity,
        awardedQuantity: row.awardedQuantity,
        unitPrice: toPesewas(row.unitPrice),
        awardedUnitPrice: toPesewas(row.awardedUnitPrice),
        unitCostAtBid: toPesewas(row.unitCostAtBid),
      }));
      const outcome = summarise(lines);

      const tender = await tx.tender.findUniqueOrThrow({
        where: { id: submission.tender.id },
        select: { status: true },
      });
      if (mayDeriveStatus(tender.status)) {
        await tx.tender.update({
          where: { id: submission.tender.id },
          data: { status: outcome.status },
        });
      }

      await tx.tenderEvent.create({
        data: {
          tenderId: submission.tender.id,
          kind: "AWARD_RECORDED",
          summary:
            `${outcome.awardedLines} awarded, ${outcome.partiallyAwardedLines} partial, ` +
            `${outcome.lostLines} not awarded` +
            (registerEntries > 0 ? ` · ${registerEntries} added to the approved register` : ""),
          detail: JSON.stringify({
            awardedValue: outcome.awardedValue / 100,
            hitRate: outcome.hitRate,
          }),
          actorId: staff.staffId,
          actorName: staff.name,
        },
      });

      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "TenderSubmission",
        entityId: submissionId,
        summary: `Recorded the outcome of ${submission.tender.reference}`,
        changes: { status: outcome.status, awardedLines: outcome.awardedLines },
      });

      return submission.tender.id;
    });

    revalidatePath(`/medicals/admin/tenders/${tenderId}`);
    revalidatePath("/medicals/admin/tenders/register");
    return {
      ok: true,
      message:
        "Outcome recorded. Awarded lines are now in the approved register — no order has been created.",
    };
  } catch (error) {
    return failed(error, "The outcome could not be recorded.");
  }
}

/** A document the institution requires with the bid. */
export async function saveTenderDocument(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("tenders");
    const tenderId = text(form, "tenderId");
    const id = text(form, "id");
    const label = text(form, "label");
    if (!tenderId || !label) return { ok: false, error: "Name the document." };

    const data = {
      label,
      isRequired: text(form, "isRequired") !== "0",
      fileUrl: text(form, "fileUrl"),
      expiresAt: date(form, "expiresAt"),
      isProvided: text(form, "isProvided") === "1",
      note: text(form, "note"),
    };

    await medicalDb.$transaction(async (tx) => {
      if (id) {
        await tx.tenderDocument.update({ where: { id }, data });
      } else {
        const last = await tx.tenderDocument.findFirst({
          where: { tenderId },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        await tx.tenderDocument.create({
          data: { ...data, tenderId, position: (last?.position ?? -10) + 10 },
        });
      }
      await recordAudit(tx, staff, {
        action: id ? "UPDATE" : "CREATE",
        entity: "TenderDocument",
        entityId: id || tenderId,
        summary: `${id ? "Updated" : "Added"} required document "${label}"`,
      });
    });

    revalidatePath(`/medicals/admin/tenders/${tenderId}`);
    return { ok: true };
  } catch (error) {
    return failed(error, "The document could not be saved.");
  }
}
