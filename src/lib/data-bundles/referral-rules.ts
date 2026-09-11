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
 * A waived fee never pays anybody — that is the rule that makes an invented
 * recruit cost more than they are worth — and neither does a fee of zero,
 * however it came to be zero.
 */
export function feeCanReward(method: string, setupFee: number): boolean {
  return method !== "WAIVED" && setupFee > 0;
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
