// Relative imports with the extension: this module is covered by a *.test.ts
// run through Node's type stripping, which resolves neither the "@/…" alias
// nor a missing extension (the same reason lib/data-bundles/flyer does it).

/**
 * What a service asks, and how fast it can be done.
 *
 * A service is paperwork: a business registration needs the proposed names
 * and the owner's Ghana Card, a passport needs a date of birth and a
 * photograph. None of that is the same from one service to the next, and a
 * form that needs a deploy is a form nobody adds — so the questions are data,
 * defined by whoever lists the service, and everything here is the shape that
 * data takes.
 *
 * Deliberately a schema rather than a free form builder. Eight field types and
 * a handful of flags, each clamped on the way in, which is enough to ask for a
 * name, a date, a choice or a document and not enough to produce a form that
 * cannot be rendered. The values arrive as JSON from a column somebody can
 * edit, so nothing below may assume they are sane.
 *
 * Pure: no React, no database, no browser. The admin's builder, the public
 * form and the server that validates a submission all read the same rules.
 */

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export const SERVICE_FIELD_TYPES = [
  { key: "text", label: "Short text" },
  { key: "textarea", label: "Long text" },
  { key: "number", label: "Number" },
  { key: "date", label: "Date" },
  { key: "phone", label: "Phone number" },
  { key: "email", label: "Email address" },
  { key: "select", label: "Choice list" },
  { key: "file", label: "Document upload" },
] as const;

export type ServiceFieldType = (typeof SERVICE_FIELD_TYPES)[number]["key"];

export function isServiceFieldType(value: unknown): value is ServiceFieldType {
  return typeof value === "string" && SERVICE_FIELD_TYPES.some((t) => t.key === value);
}

export interface ServiceField {
  /** Stable across edits — it is what an answer is filed under. */
  key: string;
  label: string;
  type: ServiceFieldType;
  required: boolean;
  /** The line under the input. Empty leaves it off. */
  hint: string;
  /** Choices, for a choice list. Ignored by every other type. */
  options: string[];
  /** Half the row on a desktop grid, so two short answers sit side by side. */
  half: boolean;
}

/**
 * More than this and it is not a form, it is an application pack.
 *
 * Sixty, because a real one is longer than it looks: a sole proprietorship
 * filing alone wants the owner, four parts of an address, three proposed names
 * and three statements of purpose, and a company adds its directors,
 * shareholders and officers on top. The ceiling also governs the merged form —
 * the service's questions plus the chosen option's — so a limit that fitted
 * the service on its own quietly truncated the option's.
 */
export const MAX_SERVICE_FIELDS = 60;
export const MAX_FIELD_OPTIONS = 20;

/** A document the customer attaches. Stored as a data URL, so bounded. */
export const MAX_DOCUMENT_BYTES = 2_500_000;
export const MAX_DOCUMENTS = 6;

const MAX_LABEL = 80;
const MAX_HINT = 160;
const MAX_ANSWER = 500;
const MAX_LONG_ANSWER = 2000;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * A key from a label: lowercase, words joined by underscores.
 *
 * Generated rather than typed, because the key is plumbing — it is what the
 * answer is filed under and what a document points back at — and asking
 * somebody listing a service to invent unique identifiers is asking for
 * collisions. `taken` keeps a second "Full name" from overwriting the first.
 */
export function serviceFieldKey(label: string, taken: readonly string[] = []): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field";
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}_${Date.now().toString(36)}`;
}

function resolveField(raw: unknown, taken: string[]): ServiceField | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const label = text(r.label, MAX_LABEL);
  if (!label) return null; // a question with no question is not one

  const type = isServiceFieldType(r.type) ? r.type : "text";
  const key = serviceFieldKey(text(r.key, 40) || label, taken);

  const options =
    type === "select" && Array.isArray(r.options)
      ? r.options
          .map((o) => text(o, MAX_LABEL))
          .filter((o) => o !== "")
          .slice(0, MAX_FIELD_OPTIONS)
      : [];

  // A choice list with nothing to choose from would render an empty dropdown
  // the customer cannot get past. It becomes a text box instead.
  const resolvedType: ServiceFieldType = type === "select" && options.length === 0 ? "text" : type;

  return {
    key,
    label,
    type: resolvedType,
    required: r.required === true,
    hint: text(r.hint, MAX_HINT),
    options,
    half: r.half === true,
  };
}

/** Read a stored `fields` column. Anything unreadable is an empty form. */
export function resolveServiceFields(raw: unknown): ServiceField[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const taken: string[] = [];
  const fields: ServiceField[] = [];
  for (const item of parsed) {
    if (fields.length >= MAX_SERVICE_FIELDS) break;
    const field = resolveField(item, taken);
    if (!field) continue;
    taken.push(field.key);
    fields.push(field);
  }
  return fields;
}

/** A new, empty question for the builder. */
export function newServiceField(type: ServiceFieldType = "text"): ServiceField {
  return { key: "", label: "", type, required: false, hint: "", options: [], half: false };
}

/**
 * The service's own questions followed by the chosen variant's.
 *
 * Both lists are resolved against one another so a variant cannot quietly
 * overwrite an answer the service already collects: a repeated key is given a
 * new one, which is what keeps the two forms independent of each other.
 */
export function mergeServiceFields(
  serviceFields: readonly ServiceField[],
  variantFields: readonly ServiceField[],
): ServiceField[] {
  const taken = serviceFields.map((f) => f.key);
  const merged = [...serviceFields];
  for (const field of variantFields) {
    if (merged.length >= MAX_SERVICE_FIELDS) break;
    const key = taken.includes(field.key) ? serviceFieldKey(field.key, taken) : field.key;
    taken.push(key);
    merged.push({ ...field, key });
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Delivery speed
// ---------------------------------------------------------------------------

/**
 * A faster way to have the same thing done.
 *
 * The fee is added to what the customer pays *and* to the agent's cost basis,
 * so it passes straight through to Nickimart. Expediting is Nickimart's cost,
 * not the agent's margin, and a speed option that quietly changed somebody's
 * commission would be a pricing bug waiting to be found.
 */
export interface ServiceSpeed {
  key: string;
  label: string;
  /** GH₵ added to the variant's fee. */
  extraFee: number;
  /** How long it takes at this speed, e.g. "3 working days". */
  turnaround: string;
  /**
   * Whether this lane is currently open. Off keeps the fee and the turnaround
   * on file while taking it off every storefront, which is what suspending a
   * service means — deleting it would mean typing them in again.
   *
   * Absent reads as on, so every speed written before this existed stays on.
   */
  enabled: boolean;
}

export const MAX_SERVICE_SPEEDS = 4;

function amount(value: unknown, max = 100_000): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(n, max) * 100) / 100;
}

export function resolveServiceSpeeds(raw: unknown): ServiceSpeed[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const taken: string[] = [];
  const speeds: ServiceSpeed[] = [];
  for (const item of parsed) {
    if (speeds.length >= MAX_SERVICE_SPEEDS) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = text(r.label, MAX_LABEL);
    if (!label) continue;
    const key = serviceFieldKey(text(r.key, 40) || label, taken);
    taken.push(key);
    speeds.push({
      key,
      label,
      extraFee: amount(r.extraFee),
      turnaround: text(r.turnaround, MAX_LABEL),
      enabled: r.enabled !== false,
    });
  }
  return speeds;
}

export function newServiceSpeed(): ServiceSpeed {
  return { key: "", label: "", extraFee: 0, turnaround: "", enabled: true };
}

/** The lanes a customer may actually choose from. */
export function openSpeeds(speeds: readonly ServiceSpeed[]): ServiceSpeed[] {
  return speeds.filter((s) => s.enabled);
}

/**
 * The speed a customer picked, or null for the ordinary one.
 *
 * A suspended lane is not found, so a storefront left open in a tab cannot
 * order one that has since been closed.
 */
export function findSpeed(speeds: readonly ServiceSpeed[], key: string): ServiceSpeed | null {
  const wanted = key.trim();
  if (!wanted) return null;
  return openSpeeds(speeds).find((s) => s.key === wanted) ?? null;
}

/**
 * Can this option be ordered at all?
 *
 * Something has to be choosable: either the ordinary speed is offered, or at
 * least one faster lane is open. Both closed is a variant nobody can buy, and
 * the editor refuses to save one.
 */
export function variantIsOrderable(variant: {
  standardEnabled: boolean;
  speeds: readonly ServiceSpeed[];
}): boolean {
  return variant.standardEnabled || openSpeeds(variant.speeds).length > 0;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export interface AnswerCheck {
  ok: boolean;
  /** The first problem, in the order the form asks — which is where to look. */
  error: string | null;
  /** Label and value, in form order, ready to be stored on the order. */
  answers: Array<{ key: string; label: string; value: string }>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[0-9+\s()-]{9,20}$/;

/**
 * Check a submitted form against the questions it was built from.
 *
 * Labels are stored alongside the values rather than looked up later: the form
 * can be edited, and an order that reads "yes" against a question nobody can
 * find any more is not a record of anything. Documents are checked for
 * presence only — the files themselves are handled separately, because they
 * are megabytes and these are strings.
 */
export function checkServiceAnswers(
  fields: readonly ServiceField[],
  values: Readonly<Record<string, string>>,
  /** Field keys that arrived with a document attached. */
  uploaded: readonly string[] = [],
): AnswerCheck {
  const answers: Array<{ key: string; label: string; value: string }> = [];
  let error: string | null = null;

  for (const field of fields) {
    if (field.type === "file") {
      const has = uploaded.includes(field.key);
      if (field.required && !has && !error) error = `Attach ${field.label.toLowerCase()}.`;
      continue;
    }

    const raw = (values[field.key] ?? "").trim();
    const value = raw.slice(0, field.type === "textarea" ? MAX_LONG_ANSWER : MAX_ANSWER);

    if (!value) {
      if (field.required && !error) error = `${field.label} is required.`;
      if (value) answers.push({ key: field.key, label: field.label, value });
      continue;
    }

    if (!error) {
      if (field.type === "email" && !EMAIL.test(value)) {
        error = `Enter a valid email address for ${field.label.toLowerCase()}.`;
      } else if (field.type === "phone" && !PHONE.test(value)) {
        error = `Enter a valid phone number for ${field.label.toLowerCase()}.`;
      } else if (field.type === "number" && !Number.isFinite(Number(value))) {
        error = `${field.label} must be a number.`;
      } else if (field.type === "date" && Number.isNaN(Date.parse(value))) {
        error = `Enter a valid date for ${field.label.toLowerCase()}.`;
      } else if (field.type === "select" && !field.options.includes(value)) {
        error = `Choose one of the options for ${field.label.toLowerCase()}.`;
      }
    }

    answers.push({ key: field.key, label: field.label, value });
  }

  return { ok: error === null, error, answers };
}

/** Read an order's stored answers back. Unreadable JSON is no answers. */
export function readStoredAnswers(
  raw: unknown,
): Array<{ key: string; label: string; value: string }> {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      key: text(a.key, 40),
      label: text(a.label, MAX_LABEL),
      value: text(a.value, MAX_LONG_ANSWER),
    }))
    .filter((a) => a.label !== "");
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface ServicePricing {
  /** What the customer pays, including the chosen speed. */
  price: number;
  /** The cost basis the commission is worked out against. */
  cost: number;
  /** What the selling agent earns. Zero on Nickimart's own storefront. */
  commission: number;
}

/**
 * What a sale is worth to everybody.
 *
 * The same arrangement as a bundle: Nickimart charges the agent a cost, the
 * agent charges their customer whatever they have set, and the difference is
 * theirs. A speed fee is added to both sides, so it reaches Nickimart whole.
 */
export function servicePricing(input: {
  /** What this seller charges for the variant, before any speed fee. */
  sellPrice: number;
  /** What the seller is charged for it. Equal to sellPrice on Nickimart's own. */
  costPrice: number;
  speedFee: number;
}): ServicePricing {
  const fee = amount(input.speedFee);
  const price = amount(input.sellPrice) + fee;
  const cost = amount(input.costPrice) + fee;
  return {
    price: Math.round(price * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    commission: Math.max(0, Math.round((price - cost) * 100) / 100),
  };
}
