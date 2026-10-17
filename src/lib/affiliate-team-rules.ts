// Relative, with the extension: this module is covered by a *.test.ts run
// through Node's type stripping, which resolves neither the "@/…" alias nor a
// missing extension. Nothing here is ever emitted, so it costs nothing.
import { formatMoney } from "./format.ts";
import {
  clampPercent,
  feeCanReward,
  registrationQuote,
  settlementSource,
  sharePercentFor,
  waiverPercentFor,
  type RegistrationQuote,
  type SettlementSource,
} from "./data-bundles/referral-rules.ts";

/**
 * The affiliate referral programme, as arithmetic.
 *
 * The bundle agents have recruited each other for a while: you bring somebody
 * in, you earn a share of what they sell, and what they pay to join is split
 * between the platform and you. This is the same arrangement for affiliates,
 * and the parts that are genuinely the same — a registration fee with a waiver
 * on it, who keeps what, whether a waived fee may still pay a reward — are
 * imported from that programme rather than written twice. One spelling of the
 * money means a change to how a waiver works cannot mean two different things
 * on two sides of the same platform.
 *
 * What is affiliate-specific is the team commission. An agent's recruits sell
 * bundles, each of which can carry a cedi amount of its own; an affiliate's
 * recruits earn a commission, and their upline earns a percentage *of that
 * commission*. It cannot be a percentage of the sale: the affiliate commission
 * is already a percentage of the sale, and two layers of that against a
 * seller-funded rate is how a platform ends up paying more for a sale than it
 * made on it.
 *
 * Pure on purpose, and tested: every function here decides where real cedis
 * go, and each of them has a direction it fails in — a reward paid for a
 * registration nobody paid for, a team cut that outgrows the commission it was
 * a share of, or an affiliate who recruited somebody, was told they'd earn,
 * and didn't.
 */

export type { RegistrationQuote, SettlementSource };
export {
  clampPercent,
  feeCanReward,
  registrationQuote,
  settlementSource,
  sharePercentFor,
  waiverPercentFor,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The configurable shape these rules read. Matches AffiliateReferralConfig. */
export interface AffiliateTeamRules {
  enabled: boolean;
  /** GH₵ paid to the direct recruiter once the new affiliate's fee is paid. */
  level1Reward: number;
  /** GH₵ paid to the recruiter's recruiter. Zero when the tier is off. */
  level2Reward: number;
  level2Enabled: boolean;
  /** Percentage of a recruit's commission credited to their direct upline. */
  teamPercentLevel1: number;
  /** The same, one level further up. Zero when the tier is off. */
  teamPercentLevel2: number;
  /** A commission below this pays the upline nothing. */
  minCommission: number;
}

/** The reward for recruiting at one level. Level 2 is zero when the tier is off. */
export function rewardForLevel(rules: AffiliateTeamRules, level: 1 | 2): number {
  if (level === 1) return round2(Math.max(0, rules.level1Reward));
  if (!rules.level2Enabled) return 0;
  return round2(Math.max(0, rules.level2Reward));
}

/** The share of a recruit's commission one level above them earns. */
export function teamPercentForLevel(rules: AffiliateTeamRules, level: 1 | 2): number {
  if (level === 1) return clampPercent(rules.teamPercentLevel1);
  if (!rules.level2Enabled) return 0;
  return clampPercent(rules.teamPercentLevel2);
}

/**
 * Does this commission pay the affiliate's upline anything?
 *
 * The minimum exists for the same reason the bundle programme has one: a
 * GH₵0.40 commission on a GH₵8 sale should not set off a payout line, a
 * clearing window and a row in somebody's team ledger. Zero switches the check
 * off, which is the default — most programmes want every sale to count.
 */
export function commissionQualifies(commissionAmount: number, minCommission: number): boolean {
  if (!(commissionAmount > 0)) return false;
  return commissionAmount >= Math.max(0, minCommission);
}

/**
 * What the upline earns on one of their recruit's commissions.
 *
 * Capped at the commission itself. A percentage over 100 is a mistyped setting
 * rather than a policy, and the one thing it must never do is pay the upline
 * more than the person who actually made the sale.
 */
export function teamCommissionOn(commissionAmount: number, percent: number): number {
  if (!(commissionAmount > 0)) return 0;
  const rate = clampPercent(percent);
  if (rate <= 0) return 0;
  return round2((commissionAmount * rate) / 100);
}

/** The link an affiliate shares to recruit. Their referral code is the key. */
export function affiliateReferralLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/become-an-affiliate?ref=${encodeURIComponent(code)}`;
}

/** The link an admin's registration invite carries. */
export function affiliateInviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/become-an-affiliate?invite=${encodeURIComponent(code)}`;
}

/**
 * A one-line summary of what recruiting pays, for the console and the pitch.
 *
 * Both halves matter and they are paid at different moments: the reward lands
 * when the person joins, the share lands every time they sell. Saying only one
 * of them is how an affiliate ends up feeling misled by a programme that was
 * being honest.
 */
export function teamRewardsLine(rules: AffiliateTeamRules): string {
  if (!rules.enabled) return "The referral programme is paused at the moment.";
  const parts: string[] = [];
  const level1 = rewardForLevel(rules, 1);
  const level2 = rewardForLevel(rules, 2);
  if (level1 > 0) parts.push(`${formatMoney(level1)} when someone you recruit joins`);
  if (level2 > 0) parts.push(`${formatMoney(level2)} when they recruit someone`);

  const share = teamPercentForLevel(rules, 1);
  const shareTwo = teamPercentForLevel(rules, 2);
  if (share > 0) parts.push(`${percentLabel(share)} of what your recruits earn`);
  if (shareTwo > 0) parts.push(`${percentLabel(shareTwo)} of what their recruits earn`);

  if (parts.length === 0) return "Recruiting doesn't pay anything extra at the moment.";
  if (parts.length === 1) return `Earn ${parts[0]}.`;
  return `Earn ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}.`;
}

/** A percentage without a pointless ".0" on the end. */
export function percentLabel(value: number): string {
  const pct = clampPercent(value);
  return `${pct % 1 === 0 ? pct : pct.toFixed(1)}%`;
}

/**
 * What is still owed on a registration fee that clears out of commission.
 *
 * Affiliates have no running wallet the way agents do — their money is a pile
 * of commission lines — so what is owed is carried on the row and paid down as
 * commission clears, rather than being read off a negative balance.
 */
export function registrationOutstanding(owed: number, paidAt: Date | null): number {
  if (paidAt) return 0;
  return round2(Math.max(0, owed));
}

/**
 * How much of a cleared commission goes to the registration fee, and how much
 * reaches the affiliate.
 *
 * The fee comes first, because that is what "it clears itself out of your
 * commission" promises. Everything above it is theirs.
 */
export function applyToRegistration(
  cleared: number,
  owed: number,
): { toFee: number; toAffiliate: number; owedAfter: number } {
  const available = Math.max(0, round2(cleared));
  const debt = Math.max(0, round2(owed));
  const toFee = round2(Math.min(available, debt));
  return {
    toFee,
    toAffiliate: round2(available - toFee),
    owedAfter: round2(debt - toFee),
  };
}
