import "server-only";
import { dataDb } from "@/lib/data-db";
import { getAgentUser } from "@/lib/data-bundles/user-link";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import {
  feeCanReward,
  registrationQuote,
  settlementSource,
  type SettlementSource,
  rewardForLevel,
  saleQualifies,
  teamCommissionAmount,
  sharePercentFor,
  waiverPercentFor,
  type RegistrationQuote,
} from "@/lib/data-bundles/referral-rules";
import {
  resolveRecruitPaymentMode,
  type PaymentMode,
} from "@/lib/data-bundles/payment-mode";
import { formatMoney } from "@/lib/format";
import {
  getAgentProgramConfig,
  getReferralConfig,
  type ReferralConfig,
} from "@/lib/data-bundles/settings";
import {
  DuplicateLedgerEntryError,
  postLedgerEntry,
} from "@/lib/data-bundles/agent-ledger";

/**
 * The referral programme: who recruited whom, and what that is worth.
 *
 * Two levels, and only two.
 *
 *   A → B → C
 *
 *   • B registers: A is paid the direct referral reward.
 *   • C registers: B is paid the direct reward, A the second-level one.
 *   • D (recruited by C) registers: C and B are paid. A gets nothing — the
 *     programme stops at two, and so does the walk up the chain.
 *   • B makes a sale: A earns the team-sales commission.
 *   • C makes a sale: B earns it. A does not. Sales pay one level, not two.
 *
 * Nothing is paid on a promise. A referral reward is released only once the new
 * agent's registration fee has actually been paid — either up front through
 * Paystack or by clearing out of their commissions — and a registration nobody
 * paid for pays nobody. That is what makes an invented agent cost the person
 * who invented them more than it pays. The one exception is a referral the
 * admin waived in full and has explicitly said should still reward.
 *
 * A recruiter can also be owed a *share* of the fee their recruit did pay. It
 * is not a reward and does not follow the reward rules: it is a slice of money
 * that changed hands, fixed on the recruit's row when their account was made,
 * and released by the same payment.
 *
 * Every amount comes from the admin's current settings at the moment the
 * commission is calculated, never from a constant here. What is already earned
 * is snapshotted — on the order, or in the ledger row — so changing a rate
 * tomorrow never rewrites what somebody was owed yesterday.
 */

/** The chain above one agent, nearest first. At most two entries. */
export interface Upline {
  /** The agent's direct recruiter. */
  level1: string | null;
  /** Their recruiter's recruiter. */
  level2: string | null;
}

/**
 * Walk up from an agent, two steps and no further.
 *
 * The stop conditions matter as much as the walk: a chain that loops back on
 * itself (which the write guards prevent, but a hand-edited row could still
 * produce) would otherwise spin here forever.
 */
export async function getUpline(agentId: string): Promise<Upline> {
  const self = await dataDb.dataAgent
    .findUnique({ where: { id: agentId }, select: { referredById: true } })
    .catch(() => null);
  const level1 = self?.referredById ?? null;
  if (!level1 || level1 === agentId) return { level1: null, level2: null };

  const up = await dataDb.dataAgent
    .findUnique({ where: { id: level1 }, select: { referredById: true } })
    .catch(() => null);
  const level2 = up?.referredById ?? null;
  // A referrer that is the agent themselves, or their own referrer again, is a
  // cycle: pay the first level and stop.
  if (!level2 || level2 === agentId || level2 === level1) return { level1, level2: null };
  return { level1, level2 };
}

// ---------------------------------------------------------------------------
// Recording the relationship
// ---------------------------------------------------------------------------

export type ReferralCodeCheck =
  | { ok: true; agentId: string; code: string; storeName: string }
  | { ok: false; message: string };

/**
 * Resolve a referral code to the agent that owns it.
 *
 * The code *is* the agent's existing code (NKM4821) — there is no second
 * identifier to lose or mistype. Matching is case-insensitive and ignores
 * surrounding whitespace, because people copy these out of WhatsApp.
 */
export async function resolveReferralCode(raw: string): Promise<ReferralCodeCheck> {
  const code = (raw ?? "").trim().toUpperCase();
  if (!code) return { ok: false, message: "Enter a referral code, or leave it blank." };

  const agent = await dataDb.dataAgent
    .findUnique({
      where: { code },
      select: { id: true, code: true, storeName: true, status: true },
    })
    .catch(() => null);

  if (!agent) return { ok: false, message: `No agent has the code “${code}”. Check it and try again.` };
  if (agent.status !== "active") {
    return { ok: false, message: "That agent's account is not active, so their code can't be used." };
  }
  return { ok: true, agentId: agent.id, code: agent.code, storeName: agent.storeName };
}

/** Digits only, so 024 123 4567 and +233241234567 compare as the same number. */
function normalisePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // Ghana numbers are written both ways. Reduce to the national 9 digits so
  // 0241234567 and 233241234567 are one number.
  if (digits.length > 9) return digits.slice(-9);
  return digits;
}

/** Why a referral was refused, in words an admin can act on. */
export type ReferralLinkResult =
  | { ok: true; referrerId: string }
  | { ok: false; reason: string };

/**
 * Decide whether one agent may be recorded as having recruited another.
 *
 * Called before the recruit exists (at approval, with their user id and contact
 * details) and again by the admin tool that fixes a referral after the fact.
 * Everything it refuses is something that has actually been tried on schemes
 * like this one.
 */
export async function checkReferralLink(input: {
  referrerId: string;
  /** The recruit, when they already exist. Omitted at approval time. */
  agentId?: string | null;
  /** The Nickimart account the recruit signs in with. */
  recruitUserId: string;
  recruitEmail?: string | null;
  recruitPhone?: string | null;
}): Promise<ReferralLinkResult> {
  const referrer = await dataDb.dataAgent
    .findUnique({
      where: { id: input.referrerId },
      select: { id: true, userId: true, status: true, supportPhone: true },
    })
    .catch(() => null);
  if (!referrer) return { ok: false, reason: "That referrer no longer exists." };
  if (referrer.status !== "active") {
    return { ok: false, reason: "That referrer's account is not active." };
  }

  // Self-referral, by whichever route: the same agent row, or the same
  // Nickimart account behind two agent rows.
  if (input.agentId && input.agentId === referrer.id) {
    return { ok: false, reason: "An agent can't refer themselves." };
  }
  if (referrer.userId === input.recruitUserId) {
    return { ok: false, reason: "That referral code belongs to this same account." };
  }

  // The same person under a second account. Two accounts are easy to make and
  // a reward is only worth farming if the farmer can collect it, so the check
  // is on what a person cannot cheaply have two of: their phone number, and the
  // email they can actually receive at. Neither is proof, and neither is meant
  // to be — an admin still approves every account and a registration fee still
  // has to be paid — but it stops the cheapest version outright.
  const referrerUser = await getAgentUser(referrer.userId);
  const recruitEmail = input.recruitEmail?.trim().toLowerCase();
  const recruitPhone = normalisePhone(input.recruitPhone);
  if (recruitEmail && referrerUser?.email?.toLowerCase() === recruitEmail) {
    return { ok: false, reason: "That referral code belongs to the same email address." };
  }
  if (
    recruitPhone &&
    (normalisePhone(referrerUser?.phone) === recruitPhone ||
      normalisePhone(referrer.supportPhone) === recruitPhone)
  ) {
    return { ok: false, reason: "That referral code belongs to the same phone number." };
  }

  // Already linked, and locked: a referrer is recorded once and is permanent
  // from activation. Changing it later would move earnings that have already
  // been paid to somebody else.
  if (input.agentId) {
    const existing = await dataDb.dataAgent
      .findUnique({
        where: { id: input.agentId },
        select: { referredById: true, referralLockedAt: true },
      })
      .catch(() => null);
    if (existing?.referredById) {
      return existing.referredById === input.referrerId
        ? { ok: false, reason: "That referral is already recorded." }
        : { ok: false, reason: "This agent already has a referrer, and it can't be changed." };
    }
    if (existing?.referralLockedAt) {
      return { ok: false, reason: "This agent's referral was settled without one and is now fixed." };
    }

    // A cycle: the referrer is already somewhere below the recruit. Two levels
    // is the whole programme, so two steps is the whole check.
    const { level1, level2 } = await getUpline(input.referrerId);
    if (level1 === input.agentId || level2 === input.agentId) {
      return { ok: false, reason: "Those two agents already refer each other." };
    }
  }

  return { ok: true, referrerId: referrer.id };
}

/**
 * Record the relationship on a newly created agent.
 *
 * Written as a guarded `updateMany` so it can only ever set a referrer that was
 * not there: two approvals racing, or a retry after a timeout, leave one
 * relationship rather than the second overwriting the first.
 */
export async function linkReferral(agentId: string, referrerId: string): Promise<boolean> {
  const claimed = await dataDb.dataAgent
    .updateMany({
      where: { id: agentId, referredById: null, referralLockedAt: null },
      data: { referredById: referrerId, referralLockedAt: new Date() },
    })
    .catch(() => ({ count: 0 }));
  return claimed.count > 0;
}

// ---------------------------------------------------------------------------
// The registration fee, and the rewards it releases
// ---------------------------------------------------------------------------

/**
 * How the people one agent recruits may settle their registration fee.
 *
 * The chain of command, resolved in one place so every screen that asks gets
 * the same answer: the programme's own mode, then the exception an admin has
 * written against this particular recruiter — and only where the admin has
 * left per-agent exceptions switched on at all. Nobody recruiting means
 * nobody's exception, so it is simply the programme's mode.
 *
 * `resolveRecruitPaymentMode` holds the precedence itself and is tested
 * directly; this is the database half of it.
 */
export async function recruitPaymentMode(referrerId: string | null): Promise<PaymentMode> {
  const program = await getAgentProgramConfig();
  if (!referrerId || !program.perAgentOverrides) return program.paymentMode;

  const referrer = await dataDb.dataAgent
    .findUnique({ where: { id: referrerId }, select: { recruitPaymentMode: true } })
    .catch(() => null);

  return resolveRecruitPaymentMode({
    programMode: program.paymentMode,
    agentMode: referrer?.recruitPaymentMode ?? null,
    perAgentOverrides: program.perAgentOverrides,
  });
}

/**
 * What one applicant will be charged to register, and who gets which part.
 *
 * The single source of that answer. The signup form quotes it, the approval
 * commits it, and the admin console explains it afterwards — so it is worked
 * out here once rather than three times, because quoting one number and
 * charging another is the one thing a registration fee must never do.
 *
 * With no recruiter there is nothing to waive and nobody to share with, so it
 * is simply the fee. Same when the referral programme is closed.
 */
export async function quoteRegistrationFee(
  referrerId: string | null,
  /** A discount from an admin-issued registration link, 0–100. */
  inviteWaiverPercent = 0,
): Promise<RegistrationQuote> {
  const [program, config] = await Promise.all([getAgentProgramConfig(), getReferralConfig()]);

  const referrer =
    referrerId && config.enabled
      ? await dataDb.dataAgent
          .findUnique({
            where: { id: referrerId },
            select: {
              id: true,
              referralWaiverPercent: true,
              referralSharePercent: true,
              status: true,
            },
          })
          .catch(() => null)
      : null;

  const active = Boolean(referrer && referrer.status === "active");
  return registrationQuote({
    fee: program.setupFee,
    inviteWaiverPercent,
    waiverPercent: active ? waiverPercentFor(referrer?.referralWaiverPercent, config.waiverDefaultPercent) : 0,
    // Per recruiter where one is set, the programme default otherwise — the
    // waiver's twin, so "this recruiter brings people in at half price and
    // keeps half of what they pay" is one agent's arrangement rather than
    // everybody's.
    referrerSharePercent: active
      ? sharePercentFor(referrer?.referralSharePercent, config.referrerSharePercent)
      : config.referrerSharePercent,
    hasReferrer: active,
  });
}

/**
 * Has this agent's registration fee been settled, and by whom?
 *
 * Two ways it can be, and one way it can't:
 *   • UPFRONT — normally they paid it through Paystack and `setupFeePaidAt` was
 *     stamped by the verification. It can also be settled from this side: an
 *     admin waiving the rest of a fee credits the balance, which clears the
 *     debt in the ledger without any payment to verify. That still has to
 *     count as settled, or an agent whose fee was forgiven is left owing
 *     nobody anything with their storefront shut. The debit must actually have
 *     been posted first — see below.
 *   • BALANCE — it was debited on approval and clears out of their commission.
 *     It is paid the moment their balance comes back to zero or above.
 *   • WAIVED, or a fee of zero — nothing was ever charged, so it is settled
 *     the moment the account is created and there is nothing for this to do.
 *     Whether it pays anybody is decided by `feeCanReward`, not here: normally
 *     it does not, which is the rule the whole "pay on registration" idea
 *     exists for, and a referral waived in full pays only if the admin has
 *     said it should.
 *
 * Settling it and paying for it are two different things, and this records
 * which happened. A balance that climbed back to zero on commission is the
 * agent paying; a balance an admin credited to clear the fee is Nickimart
 * writing it off. Both open the storefront. Only the first earns anybody a
 * referral reward — see `feeCanReward`.
 */
export async function settleSetupFee(agentId: string): Promise<boolean> {
  const agent = await dataDb.dataAgent
    .findUnique({
      where: { id: agentId },
      select: { id: true, setupFee: true, setupFeeMethod: true, setupFeePaidAt: true, balance: true },
    })
    .catch(() => null);
  if (!agent) return false;
  if (agent.setupFeePaidAt) return true;
  if (agent.setupFeeMethod === "WAIVED" || agent.setupFee <= 0) return false;

  // A brand-new account is at zero because nothing has been posted to it yet,
  // not because its fee is covered: approval creates the agent and posts the
  // debit a moment later, and anything running in that gap would otherwise read
  // an empty ledger as a settled one and pay a reward for a fee nobody has
  // paid. The debit is the proof that there is something to have cleared.
  if (agent.setupFeeMethod === "UPFRONT") {
    const charged = await dataDb.dataAgentLedger
      .findFirst({ where: { agentId, type: "SETUP_FEE" }, select: { id: true } })
      .catch(() => null);
    if (!charged) return false;
  }

  if (agent.balance < 0) return false; // still clearing

  // Whose money cleared it. An admin's credits come back out of the balance
  // first: if what remains is still in the red, those credits are what carried
  // it over the line, and a fee carried by an adjustment was written off
  // rather than paid.
  const adjusted = await dataDb.dataAgentLedger
    .aggregate({
      where: { agentId, type: "ADJUSTMENT", amount: { gt: 0 } },
      _sum: { amount: true },
    })
    .catch(() => ({ _sum: { amount: 0 } }));
  const settledBy = settlementSource({
    balance: agent.balance,
    adjustmentCredits: adjusted._sum.amount ?? 0,
  });

  const claimed = await dataDb.dataAgent
    .updateMany({
      where: { id: agentId, setupFeePaidAt: null, balance: { gte: 0 } },
      data: { setupFeePaidAt: new Date(), setupFeeSettledBy: settledBy },
    })
    .catch(() => ({ count: 0 }));
  return claimed.count > 0;
}

/**
 * Stamp how a fee settled when the caller already knows — a Paystack payment,
 * a recruiter paying from their wallet, a registration with nothing to pay.
 *
 * Only ever fills a blank. A registration records how it was settled once, at
 * the moment it settles, and nothing later rewrites it.
 */
export async function recordSettlementSource(
  agentId: string,
  source: SettlementSource,
): Promise<void> {
  await dataDb.dataAgent
    .updateMany({
      where: { id: agentId, setupFeeSettledBy: null },
      data: { setupFeeSettledBy: source },
    })
    .catch(() => {});
}

/**
 * Pay the referral rewards owed for one agent joining — at most once each.
 *
 * Safe to call whenever something might have changed: after the fee is paid,
 * after any commission lands, from the sweep. It works out what is owed, pays
 * what has not been paid, and does nothing at all the rest of the time.
 *
 * "Joining" means a registration somebody paid for. An admin crediting a new
 * agent's wallet to clear their fee is not that, however the balance ends up
 * looking afterwards — it settles the registration and pays the recruiter
 * nothing.
 */
export async function releaseReferralRewards(agentId: string): Promise<number> {
  const config = await getReferralConfig();
  if (!config.enabled) return 0;

  // The fee first: it may have just cleared.
  await settleSetupFee(agentId);

  const agent = await dataDb.dataAgent
    .findUnique({
      where: { id: agentId },
      select: {
        id: true, code: true, storeName: true,
        setupFee: true, setupFeePaidAt: true, setupFeeMethod: true,
        setupFeeGross: true, setupFeeWaiverPercent: true, setupFeeReferrerShare: true,
        setupFeeSettledBy: true,
      },
    })
    .catch(() => null);
  if (!agent?.setupFeePaidAt) return 0;
  if (
    !feeCanReward({
      method: agent.setupFeeMethod,
      payable: agent.setupFee,
      gross: agent.setupFeeGross,
      waiverPercent: agent.setupFeeWaiverPercent,
      fullWaiverPaysReward: config.fullWaiverPaysReward,
      settledBy: agent.setupFeeSettledBy as SettlementSource | null,
    })
  ) {
    return 0;
  }

  const { level1, level2 } = await getUpline(agentId);
  let paid = 0;

  // The recruiter's cut of the fee this agent actually paid. Separate from the
  // joining reward and paid alongside it: the reward is what recruiting is
  // worth, this is a share of money that changed hands.
  if (level1 && agent.setupFeeReferrerShare > 0) {
    if (await payReferrerFeeShare(level1, agent)) paid++;
  }

  const level1Reward = rewardForLevel(config, 1);
  const level2Reward = rewardForLevel(config, 2);

  if (level1 && level1Reward > 0) {
    if (await payReferralReward(level1, agent, 1, level1Reward, config)) paid++;
  }
  if (level2 && level2Reward > 0) {
    if (await payReferralReward(level2, agent, 2, level2Reward, config)) paid++;
  }
  return paid;
}

/**
 * Credit a recruiter their share of the registration fee their recruit paid.
 *
 * The amount was fixed when the account was created and is stored on the
 * recruit's row, so a settings change between joining and paying never
 * rewrites it. Paid once, keyed on the recruit — a second attempt writes
 * nothing, whether it comes from the payment, the sweep or an admin.
 *
 * The daily reward cap deliberately does not apply. It is a brake on rewards
 * conjured out of signups; this is a share of money somebody actually paid, so
 * withholding it would be keeping cedis that were never Nickimart's.
 */
async function payReferrerFeeShare(
  recipientId: string,
  source: { id: string; code: string; storeName: string; setupFeeReferrerShare: number },
): Promise<boolean> {
  const recipient = await dataDb.dataAgent
    .findUnique({ where: { id: recipientId }, select: { status: true } })
    .catch(() => null);
  // A suspended recruiter stops earning; reactivating and running the sweep
  // pays it, because the key is derived from the recruit.
  if (!recipient || recipient.status !== "active") return false;

  try {
    await postLedgerEntry({
      agentId: recipientId,
      type: "REFERRAL_FEE_SHARE",
      amount: round2(source.setupFeeReferrerShare),
      narration:
        `Your share of ${source.storeName} (${source.code})'s registration fee — ` +
        formatMoney(round2(source.setupFeeReferrerShare)),
      reference: source.code,
      sourceAgentId: source.id,
      referralLevel: 1,
      dedupeKey: `REFERRAL_FEE_SHARE:${source.id}`,
    });
    return true;
  } catch (err) {
    if (err instanceof DuplicateLedgerEntryError) return false;
    throw err;
  }
}

/** One reward to one upline agent. Returns false when it was already paid. */
async function payReferralReward(
  recipientId: string,
  source: { id: string; code: string; storeName: string },
  level: 1 | 2,
  amount: number,
  config: ReferralConfig,
): Promise<boolean> {
  const recipient = await dataDb.dataAgent
    .findUnique({ where: { id: recipientId }, select: { status: true } })
    .catch(() => null);
  // A suspended agent stops earning. The reward is not lost: the key is derived
  // from the recruit, so reactivating them and running the sweep pays it.
  if (!recipient || recipient.status !== "active") return false;

  if (await rewardCapReached(recipientId, config)) return false;

  try {
    await postLedgerEntry({
      agentId: recipientId,
      type: level === 1 ? "REFERRAL_L1" : "REFERRAL_L2",
      amount: round2(amount),
      narration:
        level === 1
          ? `Referral reward — ${source.storeName} (${source.code}) registered`
          : `Second-level referral reward — ${source.storeName} (${source.code}) joined your team`,
      reference: source.code,
      sourceAgentId: source.id,
      referralLevel: level,
      // One reward per recruit per level, for all time.
      dedupeKey: `REFERRAL_L${level}:${source.id}`,
    });
    return true;
  } catch (err) {
    if (err instanceof DuplicateLedgerEntryError) return false;
    throw err;
  }
}

/**
 * The brake on farmed signups.
 *
 * Real recruitment does not arrive in bursts. An admin still approves every
 * agent by hand and every reward still waits on a registration fee actually
 * being paid, so this is the third lock rather than the only one — but it is
 * the one that turns "invent twenty accounts overnight" into something that
 * pays for five of them and leaves fifteen registration fees behind.
 *
 * Rewards that hit the cap are not cancelled. The sweep tries them again the
 * next day, when the window has moved.
 */
async function rewardCapReached(agentId: string, config: ReferralConfig): Promise<boolean> {
  if (config.dailyRewardCap <= 0) return false;
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const count = await dataDb.dataAgentLedger
    .count({
      where: {
        agentId,
        type: { in: ["REFERRAL_L1", "REFERRAL_L2"] },
        createdAt: { gte: since },
      },
    })
    .catch(() => 0);
  return count >= config.dailyRewardCap;
}

// ---------------------------------------------------------------------------
// Team-sales commission
// ---------------------------------------------------------------------------

/**
 * What the selling agent's recruiter earns on one sale, and who they are.
 *
 * Worked out at purchase time and snapshotted on the order, so a rate change or
 * a suspension afterwards never rewrites what the sale was worth. Returns a
 * zero commission rather than null when there is an upline but the sale does
 * not qualify — the relationship is still worth recording on the order.
 */
export async function teamCommissionFor(input: {
  sellingAgentId: string;
  /** What the customer paid. */
  salePrice: number;
  /** What the selling agent earns on it. */
  sellerCommission: number;
  network: string;
  sizeGb: number;
}): Promise<{ teamAgentId: string | null; teamCommission: number }> {
  const config = await getReferralConfig();
  if (!config.enabled) return { teamAgentId: null, teamCommission: 0 };

  // Sales pay one level. B earns from C's sales; A does not.
  const { level1 } = await getUpline(input.sellingAgentId);
  if (!level1) return { teamAgentId: null, teamCommission: 0 };

  if (!saleQualifies(input.salePrice, input.sellerCommission, config)) {
    return { teamAgentId: level1, teamCommission: 0 };
  }

  const bundle = await dataDb.dataBundle
    .findUnique({
      where: { network_sizeGb: { network: input.network, sizeGb: input.sizeGb } },
      select: { teamCommission: true },
    })
    .catch(() => null);

  return {
    teamAgentId: level1,
    teamCommission: teamCommissionAmount(bundle?.teamCommission ?? 0, config.teamCommissionDefault),
  };
}

/**
 * Credit the team-sales commission on a delivered order — once.
 *
 * Called wherever the selling agent's own commission is credited, and under the
 * same rule: delivered, paid, and not already settled. A cancelled, failed or
 * refunded order never gets here, and `voidTeamCommission` closes the ones that
 * were pending when the order died.
 */
export async function creditTeamCommission(orderId: string): Promise<boolean> {
  const order = await dataDb.dataOrder
    .findUnique({
      where: { id: orderId },
      select: {
        id: true,
        reference: true,
        agentId: true,
        teamAgentId: true,
        teamCommission: true,
        status: true,
        paymentStatus: true,
        teamCommissionStatus: true,
        sizeGb: true,
        network: true,
      },
    })
    .catch(() => null);

  if (!order?.teamAgentId) return false;
  if (order.status !== "completed" || order.paymentStatus !== "paid") return false;
  if (order.teamCommissionStatus !== "pending") return false;

  if (order.teamCommission <= 0) {
    // Nothing to pay — close it rather than leaving it pending forever.
    await dataDb.dataOrder
      .updateMany({
        where: { id: orderId, teamCommissionStatus: "pending" },
        data: { teamCommissionStatus: "void" },
      })
      .catch(() => {});
    return false;
  }

  // The programme can be switched off between the sale and the delivery. What
  // was already earned stays earned; what is still pending stops.
  const config = await getReferralConfig();
  if (!config.enabled) return false;

  const upline = await dataDb.dataAgent
    .findUnique({ where: { id: order.teamAgentId }, select: { status: true } })
    .catch(() => null);
  if (!upline || upline.status !== "active") return false;

  const claimed = await dataDb.dataOrder.updateMany({
    where: { id: orderId, teamCommissionStatus: "pending" },
    data: { teamCommissionStatus: "earned", teamCommissionPaidAt: new Date() },
  });
  if (claimed.count === 0) return false;

  const seller = order.agentId
    ? await dataDb.dataAgent
        .findUnique({ where: { id: order.agentId }, select: { storeName: true, code: true } })
        .catch(() => null)
    : null;

  try {
    await postLedgerEntry({
      agentId: order.teamAgentId,
      type: "TEAM_COMMISSION",
      amount: order.teamCommission,
      narration:
        `Team commission — ${seller ? `${seller.storeName} (${seller.code})` : "your recruit"} ` +
        `sold ${order.sizeGb}GB ${order.network} (${order.reference})`,
      reference: order.reference,
      sourceAgentId: order.agentId,
      referralLevel: 1,
      dedupeKey: `TEAM_COMMISSION:${order.id}`,
    });
    return true;
  } catch (err) {
    if (err instanceof DuplicateLedgerEntryError) return true; // already paid
    // The ledger write failed — put it back so the next sweep retries.
    await dataDb.dataOrder
      .updateMany({
        where: { id: orderId, teamCommissionStatus: "earned" },
        data: { teamCommissionStatus: "pending", teamCommissionPaidAt: null },
      })
      .catch(() => {});
    return false;
  }
}

/**
 * The team commission on one AFA registration.
 *
 * AFA has no bundle row to carry an amount of its own, so it pays the
 * programme default — and only when the admin has said AFA counts at all,
 * which it does not by default: a SIM registration is a one-off piece of
 * paperwork, not the repeat selling the programme is meant to encourage.
 */
export async function afaTeamCommissionFor(input: {
  sellingAgentId: string;
  salePrice: number;
  sellerCommission: number;
}): Promise<{ teamAgentId: string | null; teamCommission: number }> {
  const config = await getReferralConfig();
  if (!config.enabled || !config.afaQualifies) return { teamAgentId: null, teamCommission: 0 };

  const { level1 } = await getUpline(input.sellingAgentId);
  if (!level1) return { teamAgentId: null, teamCommission: 0 };

  if (!saleQualifies(input.salePrice, input.sellerCommission, config)) {
    return { teamAgentId: level1, teamCommission: 0 };
  }
  return {
    teamAgentId: level1,
    teamCommission: teamCommissionAmount(0, config.teamCommissionDefault),
  };
}

/**
 * Credit the team commission on a completed AFA registration — once.
 * The bundle-order rules, applied to the other thing an agent can sell.
 */
export async function creditAfaTeamCommission(id: string): Promise<boolean> {
  const row = await dataDb.afaRegistration
    .findUnique({
      where: { id },
      select: {
        id: true,
        reference: true,
        agentId: true,
        teamAgentId: true,
        teamCommission: true,
        status: true,
        paymentStatus: true,
        teamCommissionStatus: true,
        phoneNumber: true,
      },
    })
    .catch(() => null);

  if (!row?.teamAgentId) return false;
  if (row.status !== "completed" || row.paymentStatus !== "paid") return false;
  if (row.teamCommissionStatus !== "pending") return false;

  if (row.teamCommission <= 0) {
    await dataDb.afaRegistration
      .updateMany({
        where: { id, teamCommissionStatus: "pending" },
        data: { teamCommissionStatus: "void" },
      })
      .catch(() => {});
    return false;
  }

  const config = await getReferralConfig();
  if (!config.enabled) return false;

  const upline = await dataDb.dataAgent
    .findUnique({ where: { id: row.teamAgentId }, select: { status: true } })
    .catch(() => null);
  if (!upline || upline.status !== "active") return false;

  const claimed = await dataDb.afaRegistration.updateMany({
    where: { id, teamCommissionStatus: "pending" },
    data: { teamCommissionStatus: "earned", teamCommissionPaidAt: new Date() },
  });
  if (claimed.count === 0) return false;

  const seller = row.agentId
    ? await dataDb.dataAgent
        .findUnique({ where: { id: row.agentId }, select: { storeName: true, code: true } })
        .catch(() => null)
    : null;

  try {
    await postLedgerEntry({
      agentId: row.teamAgentId,
      type: "TEAM_COMMISSION",
      amount: row.teamCommission,
      narration:
        `Team commission — ${seller ? `${seller.storeName} (${seller.code})` : "your recruit"} ` +
        `registered an AFA for ${row.phoneNumber} (${row.reference})`,
      reference: row.reference,
      sourceAgentId: row.agentId,
      referralLevel: 1,
      dedupeKey: `TEAM_COMMISSION_AFA:${row.id}`,
    });
    return true;
  } catch (err) {
    if (err instanceof DuplicateLedgerEntryError) return true;
    await dataDb.afaRegistration
      .updateMany({
        where: { id, teamCommissionStatus: "earned" },
        data: { teamCommissionStatus: "pending", teamCommissionPaidAt: null },
      })
      .catch(() => {});
    return false;
  }
}

/** Void the team commission on an AFA registration that failed. */
export async function voidAfaTeamCommission(id: string): Promise<void> {
  await dataDb.afaRegistration
    .updateMany({
      where: { id, teamCommissionStatus: "pending" },
      data: { teamCommissionStatus: "void" },
    })
    .catch(() => {});
}

/** Void the team commission on an order that failed, was cancelled or refunded. */
export async function voidTeamCommission(orderId: string): Promise<void> {
  await dataDb.dataOrder
    .updateMany({
      where: { id: orderId, teamCommissionStatus: "pending" },
      data: { teamCommissionStatus: "void" },
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Sweeps
// ---------------------------------------------------------------------------

/**
 * The agents whose upline is still owed a joining reward.
 *
 * Worked out by subtraction rather than by scanning a window of recent agents,
 * because the ones that need a sweep are precisely the ones the live path
 * missed — an upline who was suspended for a month, a reward deferred by the
 * daily cap — and those are not reliably recent. A windowed scan looks like it
 * is working while never reaching them.
 *
 * Three bounded reads: who could owe, what has already been paid, and which of
 * those referrers have a referrer of their own (which is what decides whether a
 * second-level reward is even applicable).
 */
async function agentsOwedRewards(limit: number, config: ReferralConfig): Promise<string[]> {
  const candidates = await dataDb.dataAgent
    .findMany({
      where: {
        referredById: { not: null },
        // A waived registration is normally worth nothing to anybody, so those
        // agents are skipped entirely — unless the admin has said a full
        // waiver still pays, in which case they are exactly the ones a sweep
        // has to reach.
        ...(config.fullWaiverPaysReward ? {} : { setupFeeMethod: { not: "WAIVED" } }),
        // Either the fee is settled, or it is a BALANCE fee whose balance has
        // come back through zero and simply hasn't been stamped yet.
        OR: [
          { setupFeePaidAt: { not: null } },
          { setupFeeMethod: "BALANCE", setupFeePaidAt: null, balance: { gte: 0 } },
          ...(config.fullWaiverPaysReward
            ? [{ setupFeeMethod: "WAIVED", setupFeeWaiverPercent: { gte: 100 } } as const]
            : []),
        ],
      },
      select: { id: true, referredById: true, setupFeeReferrerShare: true },
      orderBy: { createdAt: "desc" },
      // A ceiling so one sweep can't read an unbounded table; far above the
      // number of agents any of this is likely to see.
      take: 5000,
    })
    .catch(
      (): Array<{ id: string; referredById: string | null; setupFeeReferrerShare: number }> => [],
    );
  if (candidates.length === 0) return [];

  const [paidRows, referrers] = await Promise.all([
    dataDb.dataAgentLedger
      .findMany({
        where: {
          type: { in: ["REFERRAL_L1", "REFERRAL_L2", "REFERRAL_FEE_SHARE"] },
          sourceAgentId: { in: candidates.map((c) => c.id) },
        },
        select: { sourceAgentId: true, referralLevel: true, type: true },
      })
      .catch(
        (): Array<{ sourceAgentId: string | null; referralLevel: number | null; type: string }> =>
          [],
      ),
    dataDb.dataAgent
      .findMany({
        where: {
          id: { in: [...new Set(candidates.map((c) => c.referredById).filter((id): id is string => Boolean(id)))] },
        },
        select: { id: true, referredById: true },
      })
      .catch((): Array<{ id: string; referredById: string | null }> => []),
  ]);

  const paid = new Set(
    paidRows.map((r) =>
      r.type === "REFERRAL_FEE_SHARE" ? `${r.sourceAgentId}:share` : `${r.sourceAgentId}:${r.referralLevel}`,
    ),
  );
  const uplineOfUpline = new Map(referrers.map((r) => [r.id, r.referredById]));

  const owed: string[] = [];
  for (const c of candidates) {
    if (!paid.has(`${c.id}:1`)) {
      owed.push(c.id);
      continue;
    }
    // The recruiter's share of the fee can be outstanding on its own — they
    // were suspended when it came round, and the joining reward it travels
    // with has since been paid.
    if (c.setupFeeReferrerShare > 0 && !paid.has(`${c.id}:share`)) {
      owed.push(c.id);
      continue;
    }
    // A second level exists only when the recruiter has a recruiter — and it
    // can be unpaid while the first level is paid, if that agent was suspended
    // when the reward came round.
    const grandparent = c.referredById ? uplineOfUpline.get(c.referredById) : null;
    if (grandparent && !paid.has(`${c.id}:2`)) owed.push(c.id);
    if (owed.length >= limit) break;
  }
  return owed.slice(0, limit);
}

/**
 * Catch up everything the live path missed: a callback that arrived while the
 * ledger was down, an agent reactivated after the fact, a reward that hit the
 * daily cap yesterday, a setup fee that cleared on a commission nobody watched.
 * Run from the data-bundle cron alongside the selling agents' own commissions.
 */
export async function sweepReferralEarnings(limit = 100): Promise<{ rewards: number; team: number }> {
  const config = await getReferralConfig();
  if (!config.enabled) return { rewards: 0, team: 0 };

  let rewards = 0;
  for (const agentId of await agentsOwedRewards(limit, config)) {
    rewards += await releaseReferralRewards(agentId);
  }

  let team = 0;
  const pendingOrders = await dataDb.dataOrder
    .findMany({
      where: {
        teamAgentId: { not: null },
        status: "completed",
        paymentStatus: "paid",
        teamCommissionStatus: "pending",
        teamCommission: { gt: 0 },
      },
      select: { id: true },
      take: limit,
    })
    .catch((): Array<{ id: string }> => []);
  for (const order of pendingOrders) {
    if (await creditTeamCommission(order.id)) team++;
  }

  const pendingAfa = await dataDb.afaRegistration
    .findMany({
      where: {
        teamAgentId: { not: null },
        status: "completed",
        paymentStatus: "paid",
        teamCommissionStatus: "pending",
        teamCommission: { gt: 0 },
      },
      select: { id: true },
      take: limit,
    })
    .catch((): Array<{ id: string }> => []);
  for (const row of pendingAfa) {
    if (await creditAfaTeamCommission(row.id)) team++;
  }

  return { rewards, team };
}

// ---------------------------------------------------------------------------
// Reading a team
// ---------------------------------------------------------------------------

export interface TeamMember {
  id: string;
  code: string;
  storeName: string;
  slug: string;
  status: string;
  joinedAt: Date;
  /** True once their registration fee is settled — i.e. once they paid out. */
  registrationPaid: boolean;
  /** Gross value of everything they have sold. */
  sales: number;
  orderCount: number;
}

export interface TeamSummary {
  /** The agent's own code, which is their referral code. */
  code: string;
  level1: TeamMember[];
  level2: TeamMember[];
  /** Recruits at either level who are active and have sold something. */
  activeRecruits: number;
  /** Gross sales by direct recruits — the sales the team commission comes from. */
  teamSales: number;
  referralEarnings: number;
  teamSalesEarnings: number;
  /** Everything the referral programme has paid this agent. */
  totalEarnings: number;
  /** Team commission on delivered-but-not-yet-credited orders. */
  pendingTeamEarnings: number;
}

/** Everything the My Team screen shows, in one read. */
export async function getTeamSummary(agent: { id: string; code: string }): Promise<TeamSummary> {
  const level1Rows = await dataDb.dataAgent
    .findMany({
      where: { referredById: agent.id },
      select: {
        id: true, code: true, storeName: true, slug: true, status: true,
        createdAt: true, setupFeePaidAt: true,
      },
      orderBy: { createdAt: "desc" },
    })
    .catch((): [] => []);

  const level1Ids = level1Rows.map((r) => r.id);

  const [level2Rows, earnings, pendingTeam] = await Promise.all([
    level1Ids.length
      ? dataDb.dataAgent
          .findMany({
            where: { referredById: { in: level1Ids } },
            select: {
              id: true, code: true, storeName: true, slug: true, status: true,
              createdAt: true, setupFeePaidAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
          .catch((): [] => [])
      : Promise.resolve([] as never[]),
    dataDb.dataAgentLedger
      .groupBy({
        by: ["type"],
        where: {
          agentId: agent.id,
          type: {
            in: ["REFERRAL_L1", "REFERRAL_L2", "REFERRAL_FEE_SHARE", "TEAM_COMMISSION"],
          },
        },
        _sum: { amount: true },
      })
      .catch((): Array<{ type: string; _sum: { amount: number | null } }> => []),
    dataDb.dataOrder
      .aggregate({
        where: { teamAgentId: agent.id, teamCommissionStatus: "pending", paymentStatus: "paid" },
        _sum: { teamCommission: true },
      })
      .catch(() => ({ _sum: { teamCommission: 0 } })),
  ]);

  // One grouped query covers the sales of every recruit at both levels.
  const allIds = [...level1Ids, ...level2Rows.map((r) => r.id)];
  const sales = allIds.length
    ? await dataDb.dataOrder
        .groupBy({
          by: ["agentId"],
          where: { agentId: { in: allIds }, paymentStatus: "paid" },
          _sum: { price: true },
          _count: true,
        })
        .catch((): Array<{ agentId: string | null; _sum: { price: number | null }; _count: number }> => [])
    : [];
  const salesByAgent = new Map(sales.map((s) => [s.agentId, s]));

  const toMember = (row: {
    id: string; code: string; storeName: string; slug: string; status: string;
    createdAt: Date; setupFeePaidAt: Date | null;
  }): TeamMember => {
    const s = salesByAgent.get(row.id);
    return {
      id: row.id,
      code: row.code,
      storeName: row.storeName,
      slug: row.slug,
      status: row.status,
      joinedAt: row.createdAt,
      registrationPaid: Boolean(row.setupFeePaidAt),
      sales: round2(s?._sum.price ?? 0),
      orderCount: s?._count ?? 0,
    };
  };

  const level1 = level1Rows.map(toMember);
  const level2 = level2Rows.map(toMember);

  const sumOf = (type: string) =>
    round2(earnings.find((e) => e.type === type)?._sum.amount ?? 0);
  // The joining rewards and the share of the registration fees those recruits
  // paid are one number to an agent: what recruiting has earned them.
  const referralEarnings = round2(
    sumOf("REFERRAL_L1") + sumOf("REFERRAL_L2") + sumOf("REFERRAL_FEE_SHARE"),
  );
  const teamSalesEarnings = sumOf("TEAM_COMMISSION");

  return {
    code: agent.code,
    level1,
    level2,
    // "Active" is trading, not merely approved: an account that has never sold
    // is a name on a list, and counting it would flatter the number the agent
    // is trying to grow.
    activeRecruits: [...level1, ...level2].filter((m) => m.status === "active" && m.orderCount > 0).length,
    teamSales: round2(level1.reduce((sum, m) => sum + m.sales, 0)),
    referralEarnings,
    teamSalesEarnings,
    totalEarnings: round2(referralEarnings + teamSalesEarnings),
    pendingTeamEarnings: round2(pendingTeam._sum.teamCommission ?? 0),
  };
}

/**
 * The admin's view of the programme: who is recruiting, and what it has cost.
 *
 * One row per agent that has either recruited somebody or been recruited, so a
 * console that would otherwise list every agent twice over shows only the part
 * of the roster the programme actually touches.
 */
export interface ReferralOverviewRow {
  id: string;
  code: string;
  storeName: string;
  status: string;
  /** Who recruited them, if anyone. */
  referrerCode: string | null;
  referrerName: string | null;
  /** Whether their own registration fee has been paid — i.e. whether it paid out. */
  registrationPaid: boolean;
  registrationMethod: string;
  directRecruits: number;
  referralEarnings: number;
  teamSalesEarnings: number;
}

export interface ReferralOverview {
  rows: ReferralOverviewRow[];
  /** Agents with a referrer whose fee has not been paid — nothing owed on them yet. */
  awaitingRegistration: number;
  totalRewardsPaid: number;
  totalTeamCommissionPaid: number;
  /** Team commission on delivered orders that has not been credited yet. */
  pendingTeamCommission: number;
}

export async function getReferralOverview(take = 100): Promise<ReferralOverview> {
  const agents = await dataDb.dataAgent
    .findMany({
      where: { OR: [{ referredById: { not: null } }, { recruits: { some: {} } }] },
      select: {
        id: true, code: true, storeName: true, status: true,
        setupFeePaidAt: true, setupFeeMethod: true, referredById: true,
        _count: { select: { recruits: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    })
    .catch((): [] => []);

  const referrerIds = [...new Set(agents.map((a) => a.referredById).filter((id): id is string => Boolean(id)))];

  const [referrers, earnings, pending] = await Promise.all([
    referrerIds.length
      ? dataDb.dataAgent
          .findMany({ where: { id: { in: referrerIds } }, select: { id: true, code: true, storeName: true } })
          .catch((): [] => [])
      : Promise.resolve([] as never[]),
    dataDb.dataAgentLedger
      .groupBy({
        by: ["agentId", "type"],
        where: {
          agentId: { in: agents.map((a) => a.id) },
          type: {
            in: ["REFERRAL_L1", "REFERRAL_L2", "REFERRAL_FEE_SHARE", "TEAM_COMMISSION"],
          },
        },
        _sum: { amount: true },
      })
      .catch((): Array<{ agentId: string; type: string; _sum: { amount: number | null } }> => []),
    dataDb.dataOrder
      .aggregate({
        where: { teamCommissionStatus: "pending", paymentStatus: "paid" },
        _sum: { teamCommission: true },
      })
      .catch(() => ({ _sum: { teamCommission: 0 } })),
  ]);

  const byReferrer = new Map(referrers.map((r) => [r.id, r]));
  const earned = new Map<string, { rewards: number; team: number }>();
  for (const row of earnings) {
    const current = earned.get(row.agentId) ?? { rewards: 0, team: 0 };
    const amount = row._sum.amount ?? 0;
    if (row.type === "TEAM_COMMISSION") current.team += amount;
    else current.rewards += amount;
    earned.set(row.agentId, current);
  }

  const rows: ReferralOverviewRow[] = agents.map((a) => {
    const referrer = a.referredById ? byReferrer.get(a.referredById) : null;
    const e = earned.get(a.id) ?? { rewards: 0, team: 0 };
    return {
      id: a.id,
      code: a.code,
      storeName: a.storeName,
      status: a.status,
      referrerCode: referrer?.code ?? null,
      referrerName: referrer?.storeName ?? null,
      registrationPaid: Boolean(a.setupFeePaidAt),
      registrationMethod: a.setupFeeMethod,
      directRecruits: a._count.recruits,
      referralEarnings: round2(e.rewards),
      teamSalesEarnings: round2(e.team),
    };
  });

  return {
    rows,
    awaitingRegistration: rows.filter((r) => r.referrerCode && !r.registrationPaid).length,
    totalRewardsPaid: round2(rows.reduce((sum, r) => sum + r.referralEarnings, 0)),
    totalTeamCommissionPaid: round2(rows.reduce((sum, r) => sum + r.teamSalesEarnings, 0)),
    pendingTeamCommission: round2(pending._sum.teamCommission ?? 0),
  };
}

// The pure rules live in referral-rules.ts so they can be tested directly.
// Re-exported here so callers have one import for the whole programme.
export { referralLink, referralRewardsLine, saleQualifies } from "@/lib/data-bundles/referral-rules";
