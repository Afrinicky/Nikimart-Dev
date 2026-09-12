// Relative, with the extension: this module is pulled in by a *.test.ts run
// through Node's type stripping, which resolves neither the "@/…" alias nor a
// missing extension. Safe because nothing here is ever emitted — the same
// reason allowImportingTsExtensions is on in tsconfig.
import { formatMoney } from "../format.ts";
import { round2 } from "./agent-pricing.ts";

/**
 * The rules of the referral programme, as a pure module.
 *
 * Kept out of referrals.ts — which is server-only, because it talks to the
 * database — so the arithmetic and the conditions can be tested directly.
 * Getting these wrong costs real cedis in a specific direction each time: a
 * reward paid for a registration nobody paid for, a team commission paid twice
 * over on a sale that earned Nickimart nothing, or an agent who recruited
 * somebody and was told they'd earn and then didn't.
 */

/** The configurable shape these rules read. Matches ReferralConfig's fields. */
export interface ReferralRules {
  level1Reward: number;
  level2Reward: number;
  level2Enabled: boolean;
  teamCommissionDefault: number;
  minSaleAmount: number;
  minSaleCommission: number;
  enabled?: boolean;
}

/**
 * Does this sale earn the selling agent's recruiter anything?
 *
 * Both conditions are the admin's, and both exist for a reason a real
 * storefront runs into. A minimum sale amount keeps a GH₵1 test order from
 * paying out a GH₵2 commission. A minimum commission keeps a bundle an agent
 * priced at cost — almost always a mistake, sometimes a deliberate one — from
 * costing Nickimart a team commission on a sale nobody made a margin on.
 */
export function saleQualifies(
  salePrice: number,
  sellerCommission: number,
  rules: Pick<ReferralRules, "minSaleAmount" | "minSaleCommission">,
): boolean {
  if (salePrice < rules.minSaleAmount) return false;
  if (sellerCommission < rules.minSaleCommission) return false;
  return true;
}

/**
 * What the recruiter earns on one qualifying sale.
 *
 * The per-bundle amount set on the Bundle prices tab is the admin's primary
 * control; zero there means "no amount of its own", and the programme default
 * applies. Setting both to zero is how a bundle pays nothing.
 */
export function teamCommissionAmount(bundleAmount: number, defaultAmount: number): number {
  const chosen = bundleAmount > 0 ? bundleAmount : defaultAmount;
  return round2(Math.max(0, chosen));
}

/** The reward for recruiting at one level. Level 2 is zero when the tier is off. */
export function rewardForLevel(rules: ReferralRules, level: 1 | 2): number {
  if (level === 1) return round2(Math.max(0, rules.level1Reward));
  if (!rules.level2Enabled) return 0;
  return round2(Math.max(0, rules.level2Reward));
}

/**
 * Is a registration fee the kind that can release a referral reward?
 *
 * A fee somebody actually owes always can. A fee of zero normally cannot —
 * that is the rule that makes an invented recruit cost more than they are
 * worth — with exactly one exception, and only because an admin asked for it:
 * a registration waived *in full through a referral* may still pay, when
 * `fullWaiverPaysReward` is on. A fee that was zero for any other reason (the
 * programme charges nothing, an admin zeroed it) pays nobody, because there
 * was no waiver to reward.
 */
export function feeCanReward(input: {
  method: string;
  /** What the new agent owed after any waiver. */
  payable: number;
  /** The fee at full price, before the waiver. */
  gross: number;
  waiverPercent: number;
  fullWaiverPaysReward: boolean;
}): boolean {
  if (input.method !== "WAIVED" && input.payable > 0) return true;
  const waivedInFull = input.gross > 0 && input.waiverPercent >= 100;
  return waivedInFull && input.fullWaiverPaysReward;
}

// ---------------------------------------------------------------------------
// The registration fee, and who pays which part of it
// ---------------------------------------------------------------------------

/** Every part of one registration fee, in cedis. The parts always add up. */
export interface RegistrationQuote {
  /** The fee at full price, before anything is taken off. */
  gross: number;
  /** How much of it was waived, as a percentage. */
  waiverPercent: number;
  /** What that waiver was worth. */
  waived: number;
  /** What the new agent actually owes. */
  payable: number;
  /** Of what they pay, the part credited to whoever recruited them. */
  referrerShare: number;
  /** The rest of what they pay. */
  nickimartKeeps: number;
  /** True when nothing at all is owed. */
  free: boolean;
}

/**
 * Work out one registration fee.
 *
 * Worked as a pure function because it is the arithmetic three different
 * screens quote and one approval commits, and quoting one number to an
 * applicant and charging them another is the single worst thing this feature
 * could do.
 *
 * The order is: take the waiver off the fee, and the recruiter's share out of
 * what is left to pay. On a GH₵50 fee with a 40% waiver and a 50% share the
 * new agent pays GH₵30, the recruiter is credited GH₵15, and Nickimart keeps
 * GH₵15 — the waived GH₵20 is simply never collected from anybody.
 *
 * A waiver only exists where there is a recruiter to grant it, and a share
 * only where there is somebody to pay it to.
 */
export function registrationQuote(input: {
  /** The registration fee as the admin has it set. */
  fee: number;
  /** The waiver this recruit's referrer grants, 0–100. */
  waiverPercent: number;
  /** The share of the paid amount that goes to the referrer, 0–100. */
  referrerSharePercent: number;
  /** False when nobody recruited them: no waiver and no share. */
  hasReferrer: boolean;
}): RegistrationQuote {
  const gross = round2(Math.max(0, input.fee));
  const waiverPercent = input.hasReferrer ? clampPercent(input.waiverPercent) : 0;
  const waived = round2((gross * waiverPercent) / 100);
  // Subtracting the rounded waiver, rather than rounding the remainder
  // separately, is what keeps waived + payable exactly equal to gross.
  const payable = round2(gross - waived);
  const referrerShare = input.hasReferrer
    ? round2((payable * clampPercent(input.referrerSharePercent)) / 100)
    : 0;
  return {
    gross,
    waiverPercent,
    waived,
    payable,
    referrerShare,
    nickimartKeeps: round2(payable - referrerShare),
    free: payable <= 0,
  };
}

/** A percentage that can never waive more than the fee, or less than nothing. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * The waiver a given referrer's recruits get.
 *
 * Per-agent when one is set, the programme default otherwise — and null is
 * genuinely different from zero here: an agent with no setting of their own
 * follows the default as it changes, while an agent explicitly set to 0%
 * grants no waiver whatever the default becomes.
 */
export function waiverPercentFor(
  agentWaiverPercent: number | null | undefined,
  defaultPercent: number,
): number {
  return clampPercent(
    agentWaiverPercent === null || agentWaiverPercent === undefined
      ? defaultPercent
      : agentWaiverPercent,
  );
}

/**
 * What is still owed on a registration fee.
 *
 * The fee is charged as a debit, so what is outstanding is however far below
 * zero the balance still is — capped at the fee itself, because a balance
 * pushed further negative by an admin adjustment is not registration fee.
 */
export function registrationOutstanding(
  balance: number,
  setupFee: number,
  paidAt: Date | null,
): number {
  if (paidAt) return 0;
  if (balance >= 0) return 0;
  return round2(Math.min(-balance, setupFee));
}

/** The link an agent shares. Their existing agent code is the referral code. */
export function referralLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/become-an-agent?ref=${encodeURIComponent(code)}`;
}

/** A one-line summary of what recruiting pays, for the agent and pitch screens. */
export function referralRewardsLine(rules: ReferralRules): string {
  if (rules.enabled === false) return "The referral programme is paused at the moment.";
  const level1 = rewardForLevel(rules, 1);
  const level2 = rewardForLevel(rules, 2);
  if (level1 <= 0 && level2 <= 0) {
    return "Recruiting doesn't pay a joining reward at the moment — you still earn from what your team sells.";
  }
  const parts: string[] = [];
  if (level1 > 0) parts.push(`${formatMoney(level1)} when someone you recruit registers`);
  if (level2 > 0) parts.push(`${formatMoney(level2)} when they recruit someone`);
  return `Earn ${parts.join(", and ")}.`;
}

/**
 * The registration fee an agent was actually charged, read back off their row.
 *
 * Agents created before waivers existed carry a gross of zero, which is not
 * "a free registration" — it is "nobody recorded a gross, because there was
 * only ever one number". Their fee is that number, with nothing waived.
 */
export function registrationFeeBreakdown(agent: {
  setupFee: number;
  setupFeeGross: number;
  setupFeeWaiverPercent: number;
  setupFeeWaived: number;
  setupFeeReferrerShare: number;
}): RegistrationQuote {
  const payable = round2(Math.max(0, agent.setupFee));
  const gross = agent.setupFeeGross > 0 ? round2(agent.setupFeeGross) : payable;
  const waived = round2(Math.max(0, agent.setupFeeWaived));
  const referrerShare = round2(Math.max(0, agent.setupFeeReferrerShare));
  return {
    gross,
    waiverPercent: clampPercent(agent.setupFeeWaiverPercent),
    waived,
    payable,
    referrerShare,
    nickimartKeeps: round2(payable - referrerShare),
    free: payable <= 0,
  };
}
