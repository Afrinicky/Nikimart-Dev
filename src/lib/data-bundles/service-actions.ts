"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { dataUserOrNull } from "@/lib/data-bundles/session";
import { retryAfterLabel } from "@/lib/rate-limit";
import { initializeTransaction, isPaymentConfigured, toPesewas } from "@/lib/payments";
import { callbackOrigin } from "@/lib/site";
import { getServicesConfig } from "@/lib/data-bundles/settings";
import { agentIsSelling, getAgentBySlug } from "@/lib/data-bundles/agents";
import { dataRateLimit } from "@/lib/data-bundles/rate-limit";
import { parseGhPhone } from "@/lib/data-bundles/gh-phone";
import { findSellableVariant, formFor } from "@/lib/data-bundles/services";
import {
  MAX_DOCUMENTS,
  checkServiceAnswers,
  findSpeed,
  servicePricing,
} from "@/lib/data-bundles/service-fields";
import { newServiceReference, settleServiceOrder } from "@/lib/data-bundles/fulfillment";

/**
 * Public actions for the services shelf.
 *
 * Open to anyone, like the rest of the storefront: a phone number is the whole
 * identity, there is no account to make, and so every one of these is
 * rate-limited and re-priced server-side. What the browser posts is a variant
 * id, a speed key and some answers; what anything costs is read here.
 *
 * The rule the module is built around lives in this file: **no document is
 * written until the order has been paid for.** An unpaid order is a form, and
 * a form is text. The files are attached afterwards, against a reference that
 * has cleared, which is what keeps the database from filling with the
 * paperwork of people who never came back.
 */

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

const orderSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(60),
  variantId: z.string().trim().min(1).max(40),
  speedKey: z.string().trim().max(40).default(""),
  customerName: z.string().trim().min(2, "Enter your full name.").max(120),
  customerPhone: z.string().trim().min(9, "Enter the phone number to reach you on."),
  customerEmail: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .optional()
    .or(z.literal("")),
  /** The form, keyed by field. */
  answers: z.record(z.string(), z.string()).default({}),
  acceptedTerms: z.literal(true, { error: "Please accept the terms to continue." }),
  /** Ordered through an agent's storefront: their slug. */
  storeSlug: z.string().trim().max(40).optional(),
  /** The draft this was finished from, so it can be cleared. */
  draftCode: z.string().trim().max(20).optional(),
});

export type OrderServiceInput = z.input<typeof orderSchema>;

export type OrderServiceResult =
  | { ok: true; reference: string; authorizationUrl?: string }
  | { ok: false; error: string };

export async function orderService(input: OrderServiceInput): Promise<OrderServiceResult> {
  const config = await getServicesConfig();
  if (!config.enabled) {
    return { ok: false, error: "Services are not available right now. Please try again later." };
  }

  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
    };
  }
  const data = parsed.data;

  const phone = parseGhPhone(data.customerPhone);
  if (!phone.ok) return { ok: false, error: phone.message };

  const limit = await dataRateLimit(`service:${phone.local}:${await clientIp()}`, 6, 30 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many applications from this number. Please try again in ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  // Through an agent's storefront, or Nickimart's own.
  const agent = data.storeSlug ? await getAgentBySlug(data.storeSlug) : null;
  if (data.storeSlug && (!agent || !agentIsSelling(agent) || !agent.servicesEnabled)) {
    return { ok: false, error: "This store is not taking applications right now." };
  }

  // The price is read here, never taken from the page that displayed it.
  const sellable = await findSellableVariant(data.serviceSlug, data.variantId, agent?.id ?? null);
  if (!sellable) {
    return { ok: false, error: "That option is no longer available. Please choose another." };
  }
  const { service, variant } = sellable;

  const speed = findSpeed(variant.speeds, data.speedKey);
  if (data.speedKey && !speed) {
    return { ok: false, error: "That delivery option is no longer available." };
  }

  const money = servicePricing({
    sellPrice: variant.sellPrice,
    costPrice: variant.costPrice,
    speedFee: speed?.extraFee ?? 0,
  });
  if (money.price <= 0) {
    return { ok: false, error: "That option is not priced yet. Please try another." };
  }

  // The same validation the form ran, against the questions as they are now.
  // Documents are checked for presence only once the order is paid for, so
  // nothing here requires a file: see uploadServiceDocument.
  const fields = formFor(service, variant).filter((f) => f.type !== "file");
  const checked = checkServiceAnswers(fields, data.answers);
  if (!checked.ok) return { ok: false, error: checked.error ?? "Please check the form." };

  const collectPayment = isPaymentConfigured("data");

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newServiceReference();
    try {
      const row = await dataDb.dataServiceOrder.create({
        data: {
          reference,
          serviceId: service.id,
          serviceName: service.name,
          variantId: variant.id,
          variantName: variant.name,
          speedLabel: speed?.label ?? "",
          speedFee: speed?.extraFee ?? 0,
          turnaround: speed?.turnaround || variant.turnaround,
          price: money.price,
          agentCost: agent ? money.cost : 0,
          customerName: data.customerName,
          customerPhone: phone.local,
          customerEmail: data.customerEmail ?? "",
          answers: JSON.stringify(checked.answers),
          agentId: agent?.id ?? null,
          source: agent ? "STOREFRONT" : "WEB",
          agentCommission: agent ? money.commission : 0,
          commissionStatus: agent ? "pending" : "void",
          userId: (await dataUserOrNull())?.id ?? null,
        },
      });

      // The draft has become an order; there is nothing left to come back to.
      if (data.draftCode) {
        after(async () => {
          await dataDb.dataServiceDraft
            .deleteMany({ where: { code: data.draftCode!.trim().toUpperCase() } })
            .catch(() => {});
        });
      }

      if (!collectPayment) {
        after(async () => {
          await settleServiceOrder(reference);
        });
        return { ok: true, reference };
      }

      try {
        const { authorizationUrl } = await initializeTransaction(
          {
            email: data.customerEmail || `${phone.local}@data.nikimart.app`,
            amountPesewas: toPesewas(money.price),
            reference,
            callbackUrl: `${callbackOrigin()}${agent ? `/store/${agent.slug}/verify` : "/data-bundles/verify"}`,
            metadata: {
              kind: "service-order",
              serviceOrderId: row.id,
              service: service.slug,
              phoneNumber: phone.local,
              ...(agent ? { store: agent.slug, agentCode: agent.code } : {}),
            },
          },
          "data",
        );
        return { ok: true, reference, authorizationUrl };
      } catch (err) {
        await dataDb.dataServiceOrder.delete({ where: { id: row.id } }).catch(() => {});
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : "Could not start the payment. Please try again.",
        };
      }
    } catch {
      if (attempt === 4) {
        return { ok: false, error: "Could not submit the application. Please try again." };
      }
    }
  }
  return { ok: false, error: "Could not submit the application. Please try again." };
}

// ---------------------------------------------------------------------------
// Saving a half-filled form
// ---------------------------------------------------------------------------

const DRAFT_DAYS = 30;

/** A code somebody can read down a phone: no 0/O, no 1/I. */
function newDraftCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `SV-${code}`;
}

const draftSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(60),
  variantId: z.string().trim().max(40).default(""),
  speedKey: z.string().trim().max(40).default(""),
  customerName: z.string().trim().max(120).default(""),
  customerPhone: z.string().trim().min(9, "Enter a phone number so you can find this again."),
  customerEmail: z.string().trim().max(160).default(""),
  answers: z.record(z.string(), z.string()).default({}),
  /** Updating a draft already saved rather than starting another. */
  code: z.string().trim().max(20).optional(),
});

export type SaveDraftInput = z.input<typeof draftSchema>;

export type SaveDraftResult = { ok: true; code: string } | { ok: false; error: string };

/**
 * Save an application to finish later.
 *
 * These forms are long, and somebody who has to go and find a Ghana Card
 * number should not come back to an empty page. The draft is reached by a
 * code rather than by an account: the bundle store sells to guests, and a
 * login screen between a customer and a sale is a worse trade than a code
 * they write down.
 *
 * Answers only. No document is written here, because no payment has been made.
 */
export async function saveServiceDraft(input: SaveDraftInput): Promise<SaveDraftResult> {
  const config = await getServicesConfig();
  if (!config.enabled) return { ok: false, error: "Services are not available right now." };

  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const phone = parseGhPhone(data.customerPhone);
  if (!phone.ok) return { ok: false, error: phone.message };

  const limit = await dataRateLimit(`service-draft:${await clientIp()}`, 20, 60 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many saves. Please try again in ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  const service = await dataDb.dataService
    .findUnique({ where: { slug: data.serviceSlug.toLowerCase() }, select: { id: true } })
    .catch(() => null);
  if (!service) return { ok: false, error: "That service is no longer available." };

  const payload = {
    serviceId: service.id,
    variantId: data.variantId || null,
    speedKey: data.speedKey,
    customerName: data.customerName,
    customerPhone: phone.local,
    customerEmail: data.customerEmail,
    answers: JSON.stringify(data.answers),
    expiresAt: new Date(Date.now() + DRAFT_DAYS * 24 * 60 * 60_000),
  };

  try {
    if (data.code) {
      const existing = await dataDb.dataServiceDraft.findUnique({
        where: { code: data.code.toUpperCase() },
        select: { id: true },
      });
      if (existing) {
        await dataDb.dataServiceDraft.update({ where: { id: existing.id }, data: payload });
        return { ok: true, code: data.code.toUpperCase() };
      }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newDraftCode();
      try {
        await dataDb.dataServiceDraft.create({ data: { ...payload, code } });
        return { ok: true, code };
      } catch {
        if (attempt === 4) break;
      }
    }
    return { ok: false, error: "Could not save your details. Please try again." };
  } catch {
    return { ok: false, error: "Could not save your details. Please try again." };
  }
}

export interface LoadedDraft {
  code: string;
  serviceSlug: string;
  variantId: string;
  speedKey: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  answers: Record<string, string>;
}

export type LoadDraftResult =
  | { ok: true; draft: LoadedDraft }
  | { ok: false; error: string };

/** Pick a saved application back up, by its code. */
export async function loadServiceDraft(rawCode: string): Promise<LoadDraftResult> {
  const code = rawCode.trim().toUpperCase();
  if (code.length < 6) return { ok: false, error: "Enter the code you were given." };

  const limit = await dataRateLimit(`service-draft-open:${await clientIp()}`, 20, 10 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many attempts. Please try again in ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  try {
    const row = await dataDb.dataServiceDraft.findUnique({
      where: { code },
      include: { service: { select: { slug: true } } },
    });
    if (!row || !row.service) return { ok: false, error: "We couldn't find a saved application with that code." };
    if (row.expiresAt.getTime() < Date.now()) {
      return { ok: false, error: "That saved application has expired. Please start again." };
    }

    let answers: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(row.answers);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        answers = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]),
        );
      }
    } catch {
      answers = {};
    }

    return {
      ok: true,
      draft: {
        code: row.code,
        serviceSlug: row.service.slug,
        variantId: row.variantId ?? "",
        speedKey: row.speedKey,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        customerEmail: row.customerEmail,
        answers,
      },
    };
  } catch {
    return { ok: false, error: "We couldn't open that saved application. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Documents — after payment, never before
// ---------------------------------------------------------------------------

const uploadSchema = z.object({
  reference: z.string().trim().min(4).max(40),
  fieldKey: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(120),
  fileName: z.string().trim().min(1).max(160),
  mimeType: z.string().trim().max(120).default(""),
  /** The file as a data URL, built in the browser. */
  dataUrl: z.string().min(16),
});

export type UploadDocumentInput = z.infer<typeof uploadSchema>;

export type UploadDocumentResult = { ok: true } | { ok: false; error: string };

/**
 * Attach a document to an order that has been paid for.
 *
 * Payment is the confirmation of the application, so this is the first moment
 * anything of the customer's is written to disk. The reference is the key —
 * the same key the order tracker uses — and the order has to have cleared
 * before a single byte is kept.
 */
export async function uploadServiceDocument(
  input: UploadDocumentInput,
): Promise<UploadDocumentResult> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That file could not be read." };
  const data = parsed.data;

  const limit = await dataRateLimit(`service-upload:${await clientIp()}`, 40, 30 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many uploads. Please try again in ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  const config = await getServicesConfig();
  // A data URL is base64: four characters carry three bytes.
  const size = Math.round((data.dataUrl.length * 3) / 4);
  if (size > config.maxUploadBytes) {
    const mb = (config.maxUploadBytes / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return { ok: false, error: `That file is too large. The limit is ${mb}MB.` };
  }
  if (!/^data:(image\/|application\/pdf)/i.test(data.dataUrl)) {
    return { ok: false, error: "Attach a photo or a PDF." };
  }

  try {
    const order = await dataDb.dataServiceOrder.findUnique({
      where: { reference: data.reference.toUpperCase() },
      select: { id: true, paymentStatus: true, status: true, _count: { select: { documents: true } } },
    });
    if (!order) return { ok: false, error: "We couldn't find that order." };
    if (order.paymentStatus !== "paid") {
      return { ok: false, error: "Documents can be attached once payment has cleared." };
    }
    if (order.status === "cancelled" || order.status === "refunded") {
      return { ok: false, error: "This order is closed." };
    }
    if (order._count.documents >= MAX_DOCUMENTS) {
      return { ok: false, error: "This order already has the most documents it can hold." };
    }

    // One document per question: re-attaching replaces what was there, which
    // is what somebody who photographed the wrong side of a card expects.
    await dataDb.dataServiceDocument.deleteMany({
      where: { orderId: order.id, fieldKey: data.fieldKey },
    });
    await dataDb.dataServiceDocument.create({
      data: {
        orderId: order.id,
        fieldKey: data.fieldKey,
        label: data.label,
        fileName: data.fileName,
        mimeType: data.mimeType,
        size,
        dataUrl: data.dataUrl,
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not attach that file. Please try again." };
  }
}
