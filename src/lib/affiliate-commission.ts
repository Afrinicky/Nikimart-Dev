/**
 * Where an affiliate's commission actually comes from.
 *
 * A referral only earns on products that are *enrolled* in the affiliate
 * programme, and every enrolment names who pays for it:
 *
 *   • The seller enrols the product — the commission comes out of the seller's
 *     net earnings. Whatever rate they agreed to is honoured (clamped only so
 *     the seller can never end up owing money on a sale).
 *
 *   • Nickimart enrols the product — the platform funds the commission out of
 *     its own cut. That's capped at half of the platform commission on the
 *     item, so the house always keeps at least half of what it earns.
 *
 * The resolved rate and the funder are snapshotted onto the order item at sale
 * time, so changing an enrolment later never rewrites past payouts.
 */

/** The platform never funds more than this share of its own commission. */
export const ADMIN_FUNDED_MAX_SHARE = 0.5;

/** Who enrolled a product in the affiliate programme. */
export type AffiliateEnroller = "seller" | "admin" | "";

/** Who pays the affiliate for a given sale. */
export type AffiliateFunder = "seller" | "platform" | "";

export interface AffiliateEnrolment {
  affiliateEnabled: boolean;
  affiliateEnrolledBy: string;
  /** Per-product override (percent), or null to inherit. */
  affiliateCommissionRate: number | null | undefined;
}

export interface AffiliateRateInput extends AffiliateEnrolment {
  /** Category default affiliate rate (percent), or null to inherit. */
  categoryAffiliateRate: number | null | undefined;
  /** Programme default affiliate rate (percent) from site settings. */
  defaultAffiliateRate: number;
  /** Platform commission percent charged on this item. */
  platformCommissionRate: number;
}

export interface ResolvedAffiliateRate {
  /** Effective commission percent of the item price. 0 when not enrolled. */
  rate: number;
  /** Who funds it. "" when the product earns nothing. */
  fundedBy: AffiliateFunder;
  /** The rate that was asked for, before any cap was applied. */
  requestedRate: number;
  /** True when the cap reduced the requested rate. */
  capped: boolean;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, value);
}

/** Round a percent to 2dp so cap arithmetic doesn't produce 3.3333333%. */
function roundRate(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The highest affiliate rate the platform will fund on an item, given the
 * platform commission charged on it: half of that commission, never more.
 */
export function maxPlatformFundedRate(platformCommissionRate: number): number {
  return roundRate(clampPercent(platformCommissionRate) * ADMIN_FUNDED_MAX_SHARE);
}

/**
 * The highest affiliate rate a seller can sensibly fund: whatever is left of
 * the item price after the platform takes its commission. Beyond that the
 * seller would be paying to make a sale.
 */
export function maxSellerFundedRate(platformCommissionRate: number): number {
  return roundRate(Math.max(0, 100 - clampPercent(platformCommissionRate)));
}

/** Resolve the affiliate commission rate (and its funder) for one product. */
export function resolveAffiliateRate(input: AffiliateRateInput): ResolvedAffiliateRate {
  const none: ResolvedAffiliateRate = { rate: 0, fundedBy: "", requestedRate: 0, capped: false };
  if (!input.affiliateEnabled) return none;

  const enroller = input.affiliateEnrolledBy;
  if (enroller !== "seller" && enroller !== "admin") return none;

  const requested = clampPercent(
    input.affiliateCommissionRate ?? input.categoryAffiliateRate ?? input.defaultAffiliateRate,
  );
  if (requested <= 0) return none;

  const ceiling =
    enroller === "admin"
      ? maxPlatformFundedRate(input.platformCommissionRate)
      : maxSellerFundedRate(input.platformCommissionRate);

  const rate = roundRate(Math.min(requested, ceiling));
  if (rate <= 0) return none;

  return {
    rate,
    fundedBy: enroller === "admin" ? "platform" : "seller",
    requestedRate: roundRate(requested),
    capped: rate < roundRate(requested),
  };
}

/** Cash commission on a line, given the resolved rate. */
export function affiliateLineCommission(unitPrice: number, quantity: number, rate: number): number {
  return Math.round(unitPrice * quantity * rate) / 100;
}
