/**
 * The rules a forwarder's profile has to satisfy, and the tidying its fields
 * get on the way in.
 *
 * Pure: no database, no `server-only`, and relative imports, so `node --test`
 * can load it without a bundler and the rules can be checked without an admin
 * session or a Postgres. `lib/forwarder-save` does the writing; this decides
 * what is allowed to be written.
 */

// Relative, not aliased: this module is unit-tested by `node --test` with no
// bundler, so the import has to resolve without tsconfig path mapping.
import { isFreightMode, ORDER_FREQUENCIES } from "./shipping.ts";

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

export interface GoodsClassInput {
  /** Stable client-side handle. Also the key the grid's cells are stored under. */
  key: string;
  id?: string;
  name: string;
  note?: string;
  isDefault?: boolean;
}

export interface RouteInput {
  key: string;
  id?: string;
  /** The column heading. Blank falls back to the mode's own name. */
  name?: string;
  mode: string;
  currency?: string;
  minDays?: number;
  maxDays?: number;
  /** The smallest consignment this lane accepts. */
  minCbm?: number;
  orderFrequency?: string;
  orderFrequencyDetail?: string;
  note?: string;
  isActive?: boolean;
  isDefault?: boolean;
  /**
   * The column of the grid: class key → rate per cubic metre. `null` is the
   * N/A cell — this lane does not carry that class.
   */
  rates: Record<string, number | null>;
}

export interface PointInput {
  key: string;
  id?: string;
  name: string;
  code: string;
  city?: string;
  address?: string;
  note?: string;
  /** The pickup station this warehouse sits at, when it is one. */
  hubPickupId?: string | null;
  isActive?: boolean;
  /** The lanes into this warehouse — the columns of its grid. */
  routes: RouteInput[];
}

export interface ForwarderInput {
  name: string;
  code: string;
  ghanaAddress?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  originCountry?: string;
  collectionAddress?: string;
  collectionCity?: string;
  currency?: string;
  note?: string;
  terms?: string;
  isActive?: boolean;
  classes: GoodsClassInput[];
  points: PointInput[];
  /**
   * Our category id → the class keys it falls into. More than one is normal: a
   * base class and a levy class such as appliances, charged at both rates. An
   * empty list means "use their default class".
   */
  categoryMap: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Field limits
// ---------------------------------------------------------------------------

/**
 * How long each free-text field may be.
 *
 * Generous, because these are names and addresses people actually type — a
 * forwarder's short code with a phone number in it is a real thing somebody
 * wrote on purpose. Anything over the limit is refused with the limit named,
 * never quietly cut down to fit.
 */
export const LIMITS = {
  name: 120,
  code: 64,
  address: 300,
  contact: 120,
  phone: 40,
  city: 120,
  note: 500,
  terms: 4000,
  label: 120,
  detail: 120,
} as const;

export function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** A number that cannot be negative. Anything unusable is zero. */
export function nonNegative(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function whole(v: unknown): number {
  return Math.round(nonNegative(v));
}

/**
 * A short code, normalised but never truncated.
 *
 * Spaces become hyphens and letters go up, because a code is an identifier and
 * "csl syi" and "CSL-SYI" being two different forwarders helps nobody. The
 * length is checked by the caller so it can name the field.
 */
export function normaliseCode(v: unknown): string {
  return clean(v).toUpperCase().replace(/\s+/g, "-");
}

export function normaliseCurrency(v: unknown, fallback: string): string {
  const c = clean(v).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  return c.length === 3 ? c : fallback;
}

export function normaliseFrequency(v: unknown): string {
  const f = clean(v).toLowerCase();
  return (ORDER_FREQUENCIES as readonly string[]).includes(f) ? f : "";
}

/** "Forwarder name is too long — 120 characters at most, you have 148." */
export function tooLong(label: string, value: string, max: number): string | null {
  return value.length > max
    ? `${label} is too long — ${max} characters at most, and this one is ${value.length}.`
    : null;
}

// ---------------------------------------------------------------------------
// Checking the payload
// ---------------------------------------------------------------------------

/**
 * Everything wrong with a payload, found before anything is written.
 *
 * The order matters: the first problem reported should be the one nearest the
 * top of the form, so somebody working down the page fixes them in the order
 * they meet them.
 */
export function validateForwarder(input: ForwarderInput): string | null {
  const name = clean(input.name);
  const code = normaliseCode(input.code);

  if (name.length < 2) return "Give the forwarder a name.";
  const nameLong = tooLong("The forwarder name", name, LIMITS.name);
  if (nameLong) return nameLong;

  if (code.length < 2) return "Give the forwarder a short code.";
  const codeLong = tooLong("The short code", code, LIMITS.code);
  if (codeLong) return codeLong;

  for (const [label, value, max] of [
    ["The address in Ghana", clean(input.ghanaAddress), LIMITS.address],
    ["The contact person", clean(input.contactName), LIMITS.contact],
    ["The phone number", clean(input.contactPhone), LIMITS.phone],
    ["The email address", clean(input.contactEmail), LIMITS.contact],
    ["The collection address", clean(input.collectionAddress), LIMITS.address],
    ["The collection city", clean(input.collectionCity), LIMITS.city],
    ["The standing notes", clean(input.terms), LIMITS.terms],
  ] as const) {
    const problem = tooLong(label, value, max);
    if (problem) return problem;
  }

  // --- Classes: the rows of every grid --------------------------------------
  const classes = (input.classes ?? []).filter((c) => clean(c.name).length >= 2);
  if (classes.length === 0) {
    return "Add at least one class of goods — the rows of the rate grid.";
  }

  const seenClassNames = new Map<string, string>();
  for (const c of classes) {
    const cname = clean(c.name);
    const long = tooLong(`The class name “${cname}”`, cname, 80);
    if (long) return long;
    // A forwarder cannot have two classes with the same name: the database
    // enforces it, and the grid would have two identical rows whose cells
    // could not be told apart.
    const fingerprint = cname.toLowerCase();
    const first = seenClassNames.get(fingerprint);
    if (first !== undefined) {
      // Differing only by case is worth saying out loud — on the screen the two
      // rows look different, and "they are the same name" reads as nonsense
      // until you know that case is not what separates them.
      const detail =
        first === cname
          ? `Two classes of goods are both called “${cname}”.`
          : `Two classes of goods, “${first}” and “${cname}”, count as the same name — case is not what tells them apart.`;
      return `${detail} Rename one — a class name has to be unique for this forwarder.`;
    }
    seenClassNames.set(fingerprint, cname);
  }

  // --- Points: their warehouses in Ghana ------------------------------------
  const points = (input.points ?? []).filter(
    (p) => clean(p.name).length >= 2 || normaliseCode(p.code).length >= 2,
  );
  if (points.length === 0) {
    return "Add at least one consolidation point in Ghana.";
  }

  const seenPointCodes = new Set<string>();
  for (const p of points) {
    const pname = clean(p.name);
    const pcode = normaliseCode(p.code);
    if (pname.length < 2) return "Every consolidation point needs a name.";
    if (pcode.length < 2) return `Give “${pname}” a code.`;

    const nameLimit = tooLong(`The name of “${pname}”`, pname, LIMITS.name);
    if (nameLimit) return nameLimit;
    const codeLimit = tooLong(`The code for “${pname}”`, pcode, LIMITS.code);
    if (codeLimit) return codeLimit;

    if (seenPointCodes.has(pcode)) {
      return `Two consolidation points share the code ${pcode}. Every point needs its own — codes identify a warehouse across the whole platform.`;
    }
    seenPointCodes.add(pcode);

    for (const r of p.routes ?? []) {
      if (!isFreightMode(r.mode)) {
        return `“${pname}” has a column with no freight mode set. Choose sea, air, road or express.`;
      }
    }
  }

  return null;
}


