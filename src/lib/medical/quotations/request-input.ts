import { CUSTOMER_TYPES, type CustomerType } from "../customer-type.ts";

/**
 * What a quotation request has to contain before it is worth writing down.
 *
 * Pure, so the rules can be tested without a database and so the form and the
 * action cannot drift apart: the browser checks the same function that decides
 * whether the write happens.
 *
 * The shape of the rules follows from what this form is for. A laboratory
 * manager asking for a price is not a customer yet — they may not have an
 * account, they may not know the catalogue numbers, and half of what they want
 * may not be listed. So: an account is not required, a product id is not
 * required, and a request with no catalogue lines at all is valid as long as
 * they have described what they want. What *is* required is a way to answer
 * them and something to answer about.
 */

export interface RequestLineInput {
  productId?: string;
  description?: string;
  catalogueNumber?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}

export interface RequestInput {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  institutionName?: string;
  institutionType?: string;
  deliverTo?: string;
  requiredBy?: string;
  notes?: string;
  specialRequest?: string;
  lines?: RequestLineInput[];
}

export interface CleanLine {
  productId: string | null;
  description: string;
  catalogueNumber: string;
  quantity: number;
  unit: string;
  notes: string;
}

export interface CleanRequest {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  institutionName: string;
  institutionType: CustomerType | "";
  deliverTo: string;
  requiredBy: Date | null;
  notes: string;
  specialRequest: string;
  lines: CleanLine[];
}

export type RequestValidation =
  | { ok: true; value: CleanRequest }
  | { ok: false; error: string; field: string };

/** Longest a free-text field may be. Generous for a person, bounded for a robot. */
export const LIMITS = {
  name: 120,
  email: 160,
  phone: 40,
  institution: 160,
  line: 300,
  notes: 2000,
  lines: 60,
  quantity: 1_000_000,
} as const;

const trim = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * Deliberately permissive. The purpose is to catch "jonsmith.example.com", not
 * to adjudicate RFC 5322 — a form that rejects a real address is worse than
 * one that accepts an unreachable one, because the second can be answered by
 * telephone and the first cannot be answered at all.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

/** Enough digits to dial. Spaces, dashes and +233 are all fine. */
export function looksLikePhone(value: string): boolean {
  return (value.match(/\d/g) ?? []).length >= 7;
}

export function validateRequest(input: RequestInput): RequestValidation {
  const contactName = trim(input.contactName, LIMITS.name);
  if (!contactName) return { ok: false, error: "Tell us who to reply to.", field: "contactName" };

  const contactEmail = trim(input.contactEmail, LIMITS.email);
  const contactPhone = trim(input.contactPhone, LIMITS.phone);
  if (!contactEmail && !contactPhone) {
    return { ok: false, error: "An email address or a telephone number, so we can reply.", field: "contactEmail" };
  }
  if (contactEmail && !looksLikeEmail(contactEmail)) {
    return { ok: false, error: "That email address does not look right.", field: "contactEmail" };
  }
  if (contactPhone && !looksLikePhone(contactPhone)) {
    return { ok: false, error: "That telephone number does not look right.", field: "contactPhone" };
  }

  const institutionType = trim(input.institutionType, 40);
  if (institutionType && !(CUSTOMER_TYPES as readonly string[]).includes(institutionType)) {
    return { ok: false, error: "Choose what kind of organisation this is.", field: "institutionType" };
  }

  const specialRequest = trim(input.specialRequest, LIMITS.notes);

  const lines: CleanLine[] = [];
  for (const raw of (input.lines ?? []).slice(0, LIMITS.lines)) {
    const description = trim(raw.description, LIMITS.line);
    const productId = trim(raw.productId, 40);
    // A line with neither a product nor a description describes nothing. It is
    // dropped rather than refused: an empty row left behind in a form is not a
    // mistake worth stopping somebody for.
    if (!description && !productId) continue;

    const quantity = Number(raw.quantity);
    lines.push({
      productId: productId || null,
      description,
      catalogueNumber: trim(raw.catalogueNumber, 80),
      quantity:
        Number.isFinite(quantity) && quantity >= 1
          ? Math.min(Math.trunc(quantity), LIMITS.quantity)
          : 1,
      unit: trim(raw.unit, 40) || "unit",
      notes: trim(raw.notes, LIMITS.line),
    });
  }

  if (lines.length === 0 && !specialRequest) {
    return {
      ok: false,
      error: "Add at least one product, or describe what you need.",
      field: "specialRequest",
    };
  }

  // A date that has already passed is not a deadline, and a typo in a year is
  // the usual cause. Dropped rather than refused — the request still stands.
  const requiredByRaw = trim(input.requiredBy, 40);
  const parsed = requiredByRaw ? new Date(requiredByRaw) : null;
  const requiredBy = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

  return {
    ok: true,
    value: {
      contactName,
      contactEmail,
      contactPhone,
      institutionName: trim(input.institutionName, LIMITS.institution),
      institutionType: (institutionType || "") as CustomerType | "",
      deliverTo: trim(input.deliverTo, LIMITS.institution),
      requiredBy,
      notes: trim(input.notes, LIMITS.notes),
      specialRequest,
      lines,
    },
  };
}
