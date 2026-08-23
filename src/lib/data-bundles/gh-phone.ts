/**
 * Ghana mobile number rules, as a pure module.
 *
 * Every number entered anywhere in the bundle flow goes through here. The rules
 * are deliberately strict, because each way of being wrong costs real money:
 *
 *   - The provider rejects anything carrying a +233 / 233 prefix, so we only
 *     ever accept — and only ever store — the 10-digit local form.
 *   - Data credited to the wrong network cannot be reversed. A number whose
 *     prefix belongs to another operator has to be caught before payment, not
 *     after the bundle has gone.
 *   - A prefix that belongs to no Ghanaian operator at all is a typo, and
 *     sending to it fails after the customer has already been charged.
 *
 * Prefixes are the NCA's allocations. Networks we do not resell (Glo, Surfline,
 * Busy) are listed too, on purpose: knowing a number *is* a valid Glo line lets
 * us say "we don't sell Glo data" instead of "that isn't a Ghana number", which
 * is the difference between a customer fixing a typo and a customer giving up.
 */

/** Every operator with mobile prefixes in Ghana, including ones we don't sell. */
export const GH_CARRIERS = {
  MTN: { label: "MTN", prefixes: ["024", "025", "053", "054", "055", "059"] },
  TELECEL: { label: "Telecel", prefixes: ["020", "050"] },
  AIRTELTIGO: { label: "AirtelTigo", prefixes: ["026", "027", "056", "057"] },
  GLO: { label: "Glo", prefixes: ["023"] },
  SURFLINE: { label: "Surfline", prefixes: ["028"] },
  BUSY: { label: "Busy", prefixes: ["029"] },
} as const;

export type GhCarrier = keyof typeof GH_CARRIERS;

/** Every valid Ghanaian mobile prefix, for the "did you mean" message. */
export const ALL_GH_PREFIXES: string[] = Object.values(GH_CARRIERS)
  .flatMap((c) => [...c.prefixes])
  .sort();

/** The carrier a 10-digit local number belongs to, or null if the prefix is unknown. */
export function carrierForLocal(local: string): GhCarrier | null {
  const prefix = local.slice(0, 3);
  for (const [carrier, info] of Object.entries(GH_CARRIERS)) {
    if ((info.prefixes as readonly string[]).includes(prefix)) return carrier as GhCarrier;
  }
  return null;
}

export type GhPhoneProblem =
  | "empty"
  | "not-digits"
  | "international"
  | "no-leading-zero"
  | "too-short"
  | "too-long"
  | "unknown-prefix";

export type GhPhoneResult =
  | { ok: true; local: string; carrier: GhCarrier }
  | { ok: false; problem: GhPhoneProblem; message: string };

/**
 * Validate a number exactly as typed.
 *
 * Spaces and hyphens are forgiven (people type "024 123 4567"), nothing else
 * is: no +233, no country code, no 9-digit shorthand. The number must be ten
 * digits beginning with a real Ghanaian prefix.
 */
export function parseGhPhone(input: string | null | undefined): GhPhoneResult {
  const raw = (input ?? "").trim();
  if (!raw) {
    return { ok: false, problem: "empty", message: "Enter the phone number." };
  }

  // Anything that isn't a digit or common separator is a typo, not a format.
  if (/[^\d\s()+-]/.test(raw)) {
    return {
      ok: false,
      problem: "not-digits",
      message: "Phone numbers are digits only, e.g. 0241234567.",
    };
  }

  // Reject international form outright rather than silently converting it —
  // the provider only accepts the local form, and quietly rewriting what
  // someone typed is how a wrong number gets paid for.
  if (raw.startsWith("+") || /^00/.test(raw.replace(/[\s()-]/g, ""))) {
    return {
      ok: false,
      problem: "international",
      message: "Enter the number the local way, starting with 0 — e.g. 0241234567, not +233…",
    };
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("233")) {
    const suggestion = digits.length === 12 ? `0${digits.slice(3)}` : "0241234567";
    return {
      ok: false,
      problem: "international",
      message: `Drop the 233 and start with 0 — e.g. ${suggestion}.`,
    };
  }

  if (!digits.startsWith("0")) {
    return {
      ok: false,
      problem: "no-leading-zero",
      message: "Ghana numbers start with 0, e.g. 0241234567.",
    };
  }

  if (digits.length < 10) {
    return {
      ok: false,
      problem: "too-short",
      message: `That's ${digits.length} digits. A Ghana number is exactly 10, e.g. 0241234567.`,
    };
  }
  if (digits.length > 10) {
    return {
      ok: false,
      problem: "too-long",
      message: `That's ${digits.length} digits. A Ghana number is exactly 10, e.g. 0241234567.`,
    };
  }

  const carrier = carrierForLocal(digits);
  if (!carrier) {
    return {
      ok: false,
      problem: "unknown-prefix",
      message: `${digits.slice(0, 3)} isn't a Ghana mobile prefix. Valid ones are ${ALL_GH_PREFIXES.join(", ")}.`,
    };
  }

  return { ok: true, local: digits, carrier };
}

/** Convenience: the valid 10-digit local form, or null. */
export function toStrictGhPhone(input: string | null | undefined): string | null {
  const result = parseGhPhone(input);
  return result.ok ? result.local : null;
}

// ---------------------------------------------------------------------------
// Matching a number to the bundle being bought
// ---------------------------------------------------------------------------

/**
 * Which carrier a bundle's network belongs to. iShare and BigTime are both
 * AirtelTigo products, so both accept any AirtelTigo line.
 */
const NETWORK_CARRIER: Record<string, GhCarrier> = {
  MTN: "MTN",
  TELECEL: "TELECEL",
  AIRTELTIGO_ISHARE: "AIRTELTIGO",
  AIRTELTIGO_BIGTIME: "AIRTELTIGO",
};

export type RecipientCheck =
  | { ok: true; local: string }
  | { ok: false; message: string };

/**
 * The single gate a purchase has to pass: a valid Ghana number that belongs to
 * the same network as the bundle.
 *
 * `networkLabel` is passed in rather than imported so this module stays free of
 * the storefront's presentation concerns — and so the message names the network
 * the way the buyer just saw it on the card.
 */
export function checkRecipient(
  input: string | null | undefined,
  network: string,
  networkLabel: string,
): RecipientCheck {
  const parsed = parseGhPhone(input);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const wanted = NETWORK_CARRIER[network];
  if (!wanted) return { ok: false, message: "Pick a network first." };

  if (parsed.carrier !== wanted) {
    const theirs = GH_CARRIERS[parsed.carrier].label;
    return {
      ok: false,
      message:
        `${parsed.local} is a ${theirs} number, but you're buying ${networkLabel} data. ` +
        `Data sent to the wrong network can't be reversed — switch network, or check the number.`,
    };
  }

  return { ok: true, local: parsed.local };
}
