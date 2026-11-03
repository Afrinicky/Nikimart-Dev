// Relative imports with the extension: this module is covered by a *.test.ts
// run through Node's type stripping, which resolves neither the "@/…" alias
// nor a missing extension.
import { toLocalGhPhone } from "./networks.ts";
import { SERVICE_REFERENCE_PREFIX } from "./reference.ts";

/**
 * "Where was I?"
 *
 * An application is a long form and a set of documents, and almost nobody
 * does both in one sitting: they save halfway to go and find a Ghana Card
 * number, or they pay and then have to photograph the card itself. Either way
 * they come back, often on a different day and sometimes on a different
 * phone, and what they have in hand is whatever they can remember.
 *
 * So the one box takes all four of them — the code they were given, the
 * reference on their receipt, the phone number they used, or their email —
 * and this is the part that works out which. Pure, because the same rule
 * decides what the box accepts in the browser and what the server searches
 * for, and the two disagreeing is how a customer gets told their own number
 * is not a number.
 */

export const DRAFT_CODE_PREFIX = "SV-";

export type LookupKind = "code" | "reference" | "email" | "phone" | "unknown";

/** What the customer typed, and what it is. */
export interface LookupQuery {
  kind: LookupKind;
  /** Normalised for the search: upper-cased code, local phone, lower email. */
  value: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Read what somebody typed into the box.
 *
 * Deliberately forgiving about shape and strict about nothing: a code pasted
 * in lower case, a code with the "SV-" left off, a phone number copied out of
 * a call log as +233…, a reference with a stray space. Every one of those is
 * the right answer typed slightly differently, and refusing it teaches people
 * the box is broken.
 */
export function readLookup(raw: string): LookupQuery {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { kind: "unknown", value: "" };

  if (EMAIL.test(trimmed)) return { kind: "email", value: trimmed.toLowerCase() };

  const upper = trimmed.toUpperCase().replace(/\s+/g, "");
  if (upper.startsWith(SERVICE_REFERENCE_PREFIX)) return { kind: "reference", value: upper };
  if (upper.startsWith(DRAFT_CODE_PREFIX)) return { kind: "code", value: upper };

  // A phone number is the one thing here made only of digits, so it is tried
  // before the bare-code guess: "0248332322" is a number, not a code.
  const phone = toLocalGhPhone(trimmed);
  if (phone) return { kind: "phone", value: phone };

  // A code with the prefix left off, which is what somebody reading it aloud
  // leaves off. At least one letter is required: codes can in principle come
  // out all digits, but a six-digit string typed into this box is far more
  // often half a phone number, and that one is always written with its "SV-"
  // in front of it anyway.
  if (/^[2-9A-HJ-NP-Z]{6}$/.test(upper) && /[A-HJ-NP-Z]/.test(upper)) {
    return { kind: "code", value: `${DRAFT_CODE_PREFIX}${upper}` };
  }

  return { kind: "unknown", value: trimmed };
}

/** Mask all but the last three digits — enough to recognise, not to harvest. */
export function maskPhone(phone: string): string {
  return phone.length <= 3 ? phone : `${phone.slice(0, 3)}••••${phone.slice(-3)}`;
}

/** The same for an email: the first letter, the domain, nothing in between. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return email;
  return `${email[0]}••••${email.slice(at)}`;
}

/** What to tell somebody whose query matched nothing. */
export function nothingFoundMessage(kind: LookupKind): string {
  switch (kind) {
    case "code":
      return "We couldn't find a saved application with that code. Check it and try again — saved applications are kept for 30 days.";
    case "reference":
      return "We couldn't find an application with that reference.";
    case "email":
      return "Nothing in progress for that email address.";
    case "phone":
      return "Nothing in progress for that number.";
    default:
      return "Enter the code you were given, your order reference, or the phone number or email you used.";
  }
}
