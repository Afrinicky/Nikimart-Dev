/**
 * The rules the affiliate programme runs on, as arithmetic.
 *
 * Pure on purpose. Three places have to agree about them and none of them can
 * share a server module: the checkout that attributes an order, the console
 * that tells an affiliate when their money clears, and the admin screen that
 * sets the policy in the first place. A console promising payment on delivery
 * over a checkout that holds for a week is the failure this exists to prevent.
 *
 * Every rule here is resolved from the stored settings once and then
 * *snapshotted* onto the row it decided — the attribution carries its own
 * window, the commission carries its own return window and rate. Shortening
 * the window tomorrow moves new referrals and leaves the ones somebody is
 * already running exactly where they were promised.
 */

// Relative, with the extension: this module is covered by a *.test.ts run
// through Node's type stripping, which resolves neither the "@/…" alias nor a
// missing extension.
import {
  resolveAffiliateRate,
  type AffiliateRateInput,
  type ResolvedAffiliateRate,
} from "./affiliate-commission.ts";

// ---------------------------------------------------------------------------
// The policy
// ---------------------------------------------------------------------------

export type AttributionModel = "last" | "first";

export interface AffiliatePolicy {
  /** The whole programme. Off closes the console and stops new attribution. */
  enabled: boolean;
  /** Whether somebody who is neither a seller nor an agent may apply. */
  applicationsOpen: boolean;
  autoApproveSellers: boolean;
  autoApproveAgents: boolean;
  /** How long a referral stays attributed, in days. */
  attributionWindowDays: number;
  /** Which click wins when a visitor arrives through two affiliates' links. */
  attributionModel: AttributionModel;
  /** Days after delivery before commission is payable. */
  returnWindowDays: number;
  minPayout: number;
  payoutFee: number;
  blockSelfReferral: boolean;
  /**
   * Referred orders one buyer account may put through one affiliate's links in
   * a day before the rest are flagged for review. 0 switches the check off.
   */
  maxOrdersPerVisitorPerDay: number;
  /** The default share caption. */
  shareMessage: string;
  terms: string;
  supportWhatsapp: string;
  /** Programme default commission percent, and the advertised ceiling. */
  defaultRate: number;
  maxRate: number;
}

export const AFFILIATE_POLICY_FALLBACK: AffiliatePolicy = {
  enabled: true,
  applicationsOpen: true,
  autoApproveSellers: true,
  autoApproveAgents: true,
  attributionWindowDays: 30,
  attributionModel: "last",
  returnWindowDays: 7,
  minPayout: 20,
  payoutFee: 0,
  blockSelfReferral: true,
  maxOrdersPerVisitorPerDay: 3,
  shareMessage:
    "Grab this on Nickimart — genuine goods, nationwide delivery. Order with my link below 👇",
  terms: "",
  supportWhatsapp: "",
  defaultRate: 5,
  maxRate: 10,
};

/** A stored setting that means yes. Anything unreadable keeps the fallback. */
function flag(raw: string | undefined, fallback: boolean): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

/**
 * A number from a stored setting.
 *
 * An unset setting is an empty string, and `Number("")` is 0 — which would
 * clamp to the minimum and quietly set the attribution window to one day for
 * every platform that has never opened the form. Blank has to mean "not set".
 */
function whole(raw: string | undefined, fallback: number, min = 0, max = 3650): number {
  const value = (raw ?? "").trim();
  if (value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function amount(raw: string | undefined, fallback: number): number {
  const value = (raw ?? "").trim();
  if (value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

function percent(raw: string | undefined, fallback: number): number {
  const value = (raw ?? "").trim();
  if (value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return Math.round(n * 100) / 100;
}

/**
 * The policy the stored settings describe.
 *
 * Nothing here can throw and nothing here can produce a nonsense value: a
 * mistyped window in the admin console should fall back to thirty days, not
 * leave every attribution expiring in the past.
 */
export function resolveAffiliatePolicy(
  raw: Record<string, string | undefined> = {},
): AffiliatePolicy {
  const f = AFFILIATE_POLICY_FALLBACK;
  const model = (raw.affiliateAttributionModel ?? "").trim().toLowerCase();
  return {
    enabled: flag(raw.affiliateProgramEnabled, f.enabled),
    applicationsOpen: flag(raw.affiliateApplicationsOpen, f.applicationsOpen),
    autoApproveSellers: flag(raw.affiliateAutoApproveSellers, f.autoApproveSellers),
    autoApproveAgents: flag(raw.affiliateAutoApproveAgents, f.autoApproveAgents),
    // A window of zero days would attribute nothing at all, which is not a
    // policy anybody means to set — one day is the shortest honest answer.
    attributionWindowDays: whole(raw.affiliateAttributionWindowDays, f.attributionWindowDays, 1, 365),
    attributionModel: model === "first" ? "first" : "last",
    returnWindowDays: whole(raw.affiliateReturnWindowDays, f.returnWindowDays, 0, 180),
    minPayout: amount(raw.affiliateMinPayout, f.minPayout),
    payoutFee: amount(raw.affiliatePayoutFee, f.payoutFee),
    blockSelfReferral: flag(raw.affiliateBlockSelfReferral, f.blockSelfReferral),
    maxOrdersPerVisitorPerDay: whole(
      raw.affiliateMaxOrdersPerVisitorPerDay,
      f.maxOrdersPerVisitorPerDay,
      0,
      500,
    ),
    shareMessage: (raw.affiliateShareMessage ?? "").trim() || f.shareMessage,
    terms: (raw.affiliateTerms ?? "").trim(),
    supportWhatsapp: (raw.affiliateSupportWhatsapp ?? "").trim(),
    defaultRate: percent(raw.affiliateRate, f.defaultRate),
    maxRate: percent(raw.affiliateMaxRate, f.maxRate),
  };
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

/** When an attribution created now runs out. */
export function attributionExpiry(from: Date, windowDays: number): Date {
  const days = Math.max(1, Math.round(windowDays));
  return new Date(from.getTime() + days * DAY);
}

export interface AttributionCandidate {
  affiliateId: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

/**
 * Which affiliate a visitor belongs to, out of every live attribution on them.
 *
 * Under "last" the most recent click wins, which is the industry norm and the
 * one an affiliate expects when they are the reason somebody came back today.
 * Under "first" the earliest does, which rewards discovery. Expired
 * attributions are not candidates at all — a window that has run out is not a
 * weaker claim, it is no claim.
 */
export function pickAttribution(
  candidates: AttributionCandidate[],
  model: AttributionModel,
  now: Date = new Date(),
): AttributionCandidate | null {
  const live = candidates.filter((c) => c.expiresAt.getTime() > now.getTime());
  if (live.length === 0) return null;
  const sorted = [...live].sort((a, b) =>
    model === "first"
      ? a.firstSeenAt.getTime() - b.firstSeenAt.getTime()
      : b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
  );
  return sorted[0];
}

// ---------------------------------------------------------------------------
// Abuse
// ---------------------------------------------------------------------------

export type FraudKind =
  | "self_referral"
  | "same_account"
  | "same_device"
  | "same_ip"
  | "velocity"
  | "expired_window"
  | "suspended"
  | "duplicate_payment"
  | "rate_anomaly";

export interface FraudSignal {
  kind: FraudKind;
  /** "block" refuses the commission; "warn" lets it through for review. */
  severity: "info" | "warn" | "block";
  detail: string;
}

export interface ReferralCheck {
  /** The affiliate's own user account, when they have one. */
  affiliateUserId: string | null;
  affiliateStatus: string;
  /** The buyer placing the order. */
  buyerUserId: string;
  /** Does the buyer's email or phone match the affiliate's? */
  contactMatch?: boolean;
  expiresAt: Date | null;
  /** Referred orders this buyer has already put through these links today. */
  visitorOrdersToday?: number;
  policy: Pick<
    AffiliatePolicy,
    "blockSelfReferral" | "maxOrdersPerVisitorPerDay" | "enabled"
  >;
  now?: Date;
}

export interface ReferralVerdict {
  /** True when the referral may earn commission. */
  attributed: boolean;
  signals: FraudSignal[];
}

/**
 * Whether a referral earns, and everything suspicious about it either way.
 *
 * Deliberately separated from the decision: a blocking signal refuses the
 * commission, a warning one lets it through and puts it in front of an admin.
 * Both are recorded, so "why did this order not earn" and "why did this one"
 * always have an answer — which is the part a commission dispute turns on.
 */
export function assessReferral(input: ReferralCheck): ReferralVerdict {
  const now = input.now ?? new Date();
  const signals: FraudSignal[] = [];
  let blocked = false;

  if (!input.policy.enabled) {
    return {
      attributed: false,
      signals: [
        { kind: "suspended", severity: "block", detail: "The affiliate programme is switched off." },
      ],
    };
  }

  if (input.affiliateStatus !== "active") {
    signals.push({
      kind: "suspended",
      severity: "block",
      detail: `The affiliate account is ${input.affiliateStatus}, so this order earns nothing.`,
    });
    blocked = true;
  }

  if (!input.expiresAt || input.expiresAt.getTime() <= now.getTime()) {
    signals.push({
      kind: "expired_window",
      severity: "block",
      detail: "The referral window had already closed when the order was placed.",
    });
    blocked = true;
  }

  const sameAccount =
    input.affiliateUserId !== null && input.affiliateUserId === input.buyerUserId;
  if (sameAccount) {
    signals.push({
      kind: "self_referral",
      severity: input.policy.blockSelfReferral ? "block" : "warn",
      detail: "The buyer is the affiliate's own account.",
    });
    if (input.policy.blockSelfReferral) blocked = true;
  } else if (input.contactMatch) {
    // Not the same login, but the same phone or inbox. Worth a human look
    // rather than a refusal: families share a number, and so do resellers
    // ordering on a customer's behalf.
    signals.push({
      kind: "same_account",
      severity: "warn",
      detail: "The buyer's contact details match the affiliate's.",
    });
  }

  const cap = input.policy.maxOrdersPerVisitorPerDay;
  if (cap > 0 && (input.visitorOrdersToday ?? 0) >= cap) {
    signals.push({
      kind: "velocity",
      severity: "warn",
      detail: `This buyer has already placed ${input.visitorOrdersToday} referred orders today (cap ${cap}).`,
    });
  }

  return { attributed: !blocked, signals };
}

// ---------------------------------------------------------------------------
// The commission lifecycle
// ---------------------------------------------------------------------------

export type CommissionStatus = "pending" | "clearing" | "cleared" | "paid" | "reversed";

/** The earliest a commission may be paid: delivery plus the return window. */
export function commissionHoldUntil(deliveredAt: Date, returnWindowDays: number): Date {
  const days = Math.max(0, Math.round(returnWindowDays));
  return new Date(deliveredAt.getTime() + days * DAY);
}

export interface LifecycleInput {
  /** The order's status right now. */
  orderStatus: string;
  /** When the order was marked delivered, if it has been. */
  deliveredAt: Date | null;
  /** The window snapshotted on the commission row. */
  returnWindowDays: number;
  /** Already settled by a payout — terminal. */
  paid: boolean;
  /** Already reversed — terminal until an admin releases it. */
  reversed: boolean;
  now?: Date;
}

/** Order statuses that void commission outright. */
const VOID_STATUSES = new Set(["cancelled", "refunded"]);

/**
 * Where a commission stands, derived rather than stored-and-hoped.
 *
 * Deriving it means the ledger can be reconciled from the order at any time,
 * which is what makes every caller safe to run twice: a payment notification
 * the gateway sends three times, a status saved again by an admin, a nightly
 * sweep. None of them can advance a commission twice, because none of them
 * advances anything — they recompute what it should be and write that.
 */
export function commissionStatusFor(input: LifecycleInput): CommissionStatus {
  if (input.reversed) return "reversed";
  if (VOID_STATUSES.has(input.orderStatus)) return "reversed";
  if (input.paid) return "paid";

  const now = input.now ?? new Date();
  if (input.orderStatus !== "delivered" || !input.deliveredAt) return "pending";

  const until = commissionHoldUntil(input.deliveredAt, input.returnWindowDays);
  return until.getTime() <= now.getTime() ? "cleared" : "clearing";
}

/** Only a cleared commission is money the affiliate can ask for. */
export function isPayable(status: CommissionStatus): boolean {
  return status === "cleared";
}

/**
 * What a refund takes back off a commission.
 *
 * Proportional, because a partial refund is a partial sale: refunding a third
 * of a line's value should take back a third of what it earned, not all of it
 * and not none of it. A refund at or over the line value takes the lot.
 */
export function reversalForRefund(
  commissionAmount: number,
  lineValue: number,
  refundedValue: number,
): number {
  if (!(commissionAmount > 0)) return 0;
  if (!(lineValue > 0) || refundedValue >= lineValue) return round2(commissionAmount);
  if (!(refundedValue > 0)) return 0;
  return round2((commissionAmount * refundedValue) / lineValue);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Eligibility and rates
// ---------------------------------------------------------------------------

/** What a signed-in person already is, as far as the programme cares. */
export interface ApplicantStanding {
  isSeller: boolean;
  isAgent: boolean;
  isAdmin: boolean;
}

export type AdmissionRoute = "auto" | "apply" | "closed";

/**
 * How this person gets in: straight through, through an application, or not
 * at all.
 *
 * Sellers and bundle agents have been verified once already — asking them to
 * fill in a form about their following to promote the catalogue they are
 * already selling on is friction with no decision behind it. Everybody else
 * applies, unless the admin has closed applications, in which case saying so
 * plainly beats a form that is never read.
 */
export function admissionRoute(
  who: ApplicantStanding,
  policy: Pick<
    AffiliatePolicy,
    "enabled" | "applicationsOpen" | "autoApproveSellers" | "autoApproveAgents"
  >,
): AdmissionRoute {
  if (!policy.enabled) return "closed";
  if (who.isAdmin) return "auto";
  if (who.isSeller && policy.autoApproveSellers) return "auto";
  if (who.isAgent && policy.autoApproveAgents) return "auto";
  return policy.applicationsOpen ? "apply" : "closed";
}

/** Where a product's affiliate rate came from, for the ledger's audit trail. */
export type RateSource = "affiliate" | "product" | "category" | "default";

export function rateSource(input: {
  affiliateOverride: number | null | undefined;
  productRate: number | null | undefined;
  categoryRate: number | null | undefined;
}): RateSource {
  if (input.affiliateOverride != null && input.affiliateOverride > 0) return "affiliate";
  if (input.productRate != null && input.productRate > 0) return "product";
  if (input.categoryRate != null && input.categoryRate > 0) return "category";
  return "default";
}

export interface ProductRateInput extends Omit<AffiliateRateInput, "defaultAffiliateRate"> {
  /** The programme default, or this affiliate's override when they have one. */
  defaultAffiliateRate: number;
  /** The affiliate's own negotiated rate, if any. */
  affiliateOverride?: number | null;
}

export interface ResolvedProductRate extends ResolvedAffiliateRate {
  source: RateSource;
}

/**
 * The commission one product pays one affiliate, and which rule decided it.
 *
 * A thin layer over resolveAffiliateRate, which already owns the hard part —
 * who funds the commission and the cap that stops a seller paying to make a
 * sale. What is added is the audit trail: the console shows an affiliate *why*
 * they earn 7% on something, and the ledger has to keep that answer even after
 * somebody edits the product.
 */
export function resolveProductRate(input: ProductRateInput): ResolvedProductRate {
  const override =
    input.affiliateOverride != null && input.affiliateOverride > 0
      ? input.affiliateOverride
      : null;
  const resolved = resolveAffiliateRate({
    ...input,
    // An affiliate's negotiated rate stands in for the programme default: it
    // is a floor they were promised, not a licence to beat a rate the product
    // itself names.
    defaultAffiliateRate: override ?? input.defaultAffiliateRate,
  });
  return {
    ...resolved,
    source: rateSource({
      affiliateOverride: override,
      productRate: input.affiliateCommissionRate,
      categoryRate: input.categoryAffiliateRate,
    }),
  };
}

// ---------------------------------------------------------------------------
// Share captions
// ---------------------------------------------------------------------------

export interface ShareVars {
  product: string;
  price: string;
  link: string;
  shop?: string;
  message?: string;
}

/**
 * Fill a caption template.
 *
 * Affiliates write their own captions, and a caption without the link in it is
 * a post that earns nothing — so a template that forgets `{link}` gets it
 * appended rather than being silently published broken. Unknown placeholders
 * are left alone: somebody writing "50% {off}" meant the braces.
 */
export function renderShareMessage(template: string, vars: ShareVars): string {
  const body = (template || "").trim();
  const filled = body.replace(/\{(product|price|link|shop|message)\}/g, (_m, key: string) => {
    const value = vars[key as keyof ShareVars];
    return (value ?? "").toString();
  });
  if (vars.link && !filled.includes(vars.link)) {
    return `${filled}\n\n${vars.link}`.trim();
  }
  return filled;
}
