import "server-only";
import { dataDb } from "@/lib/data-db";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import {
  feeCanReward,
  rewardForLevel,
  saleQualifies,
  teamCommissionAmount,
} from "@/lib/data-bundles/referral-rules";
import { getReferralConfig, type ReferralConfig } from "@/lib/data-bundles/settings";
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
 * Paystack or by clearing out of their commissions — and a fee an admin waived
 * pays nobody, ever. That is what makes an invented agent cost the person who
 * invented them more than it pays.
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
 * Has this agent's registration fee actually been paid?
 *
 * Two ways it can be, and one way it can't:
 *   • UPFRONT — they paid it through Paystack; `setupFeePaidAt` was stamped by
 *     the verification.
 *   • BALANCE — it was debited on approval and clears out of their commission.
 *     It is paid the moment their balance comes back to zero or above.
 *   • WAIVED, or a fee of zero — nothing was ever charged, so nothing is owed
 *     to anybody for recruiting them. This is the case the whole "pay on
 *     registration" rule exists for: a waived fee must not mint a reward.
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
  if (agent.setupFeeMethod === "UPFRONT") return false; // only the payment itself settles this
  if (agent.balance < 0) return false; // still clearing

  const claimed = await dataDb.dataAgent
    .updateMany({
      where: { id: agentId, setupFeePaidAt: null, balance: { gte: 0 } },
      data: { setupFeePaidAt: new Date() },
    })
    .catch(() => ({ count: 0 }));
  return claimed.count > 0;
}

/**
 * Pay the referral rewards owed for one agent joining — at most once each.
 *
 * Safe to call whenever something might have changed: after the fee is paid,
 * after any commission lands, from the sweep. It works out what is owed, pays
 * what has not been paid, and does nothing at all the rest of the time.
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
      },
    })
    .catch(() => null);
  if (!agent?.setupFeePaidAt) return 0;
  if (!feeCanReward(agent.setupFeeMethod, agent.setupFee)) return 0;

  const { level1, level2 } = await getUpline(agentId);
  let paid = 0;

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
 * Catch up everything the live path missed: a callback that arrived while the
 * ledger was down, an agent reactivated after the fact, a reward that hit the
 * daily cap yesterday, a setup fee that cleared on a commission nobody watched.
 * Run from the data-bundle cron alongside the selling agents' own commissions.
 */
export async function sweepReferralEarnings(limit = 100): Promise<{ rewards: number; team: number }> {
  const config = await getReferralConfig();
  if (!config.enabled) return { rewards: 0, team: 0 };

  let rewards = 0;
  // Agents with an upline whose fee has been paid but who may not have paid out
  // yet. Cheap to re-check: releaseReferralRewards is a no-op once both levels
  // are settled.
  const owed = await dataDb.dataAgent
    .findMany({
      where: { referredById: { not: null }, setupFeeMethod: { not: "WAIVED" } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
    .catch((): Array<{ id: string }> => []);
  for (const agent of owed) {
    rewards += await releaseReferralRewards(agent.id);
  }

  let team = 0;
  const pending = await dataDb.dataOrder
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
  for (const order of pending) {
    if (await creditTeamCommission(order.id)) team++;
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
        where: { agentId: agent.id, type: { in: ["REFERRAL_L1", "REFERRAL_L2", "TEAM_COMMISSION"] } },
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
  const referralEarnings = round2(sumOf("REFERRAL_L1") + sumOf("REFERRAL_L2"));
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

// The pure rules live in referral-rules.ts so they can be tested directly.
// Re-exported here so callers have one import for the whole programme.
export { referralLink, referralRewardsLine, saleQualifies } from "@/lib/data-bundles/referral-rules";
