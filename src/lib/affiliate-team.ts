import "server-only";
import { prisma } from "@/lib/prisma";
import { getAffiliateReferralConfig } from "@/lib/affiliate-settings";
import {
  commissionQualifies,
  feeCanReward,
  rewardForLevel,
  teamCommissionOn,
  teamPercentForLevel,
} from "@/lib/affiliate-team-rules";

/**
 * Affiliate teams: who recruited whom, and what that is worth.
 *
 * Two kinds of money, and they are paid at different moments. A **team sale**
 * pays an upline a share of what their recruit's own selling earned, and it
 * follows that commission exactly — it is pending while the order is, it
 * clears when the return window closes on it, and it is taken back when the
 * buyer sends the goods back. A **joining reward** pays once, when the person
 * they recruited has actually paid their registration fee.
 *
 * Nothing here advances a row. Every function recomputes what a team earning
 * should say from the commission it hangs off and writes that, which is what
 * makes all of them safe to run twice — the same rule the commission ledger
 * itself is built on. The `dedupeKey` unique index is the second guard: two
 * callers racing produce one row and one constraint violation.
 *
 * The amount, though, is written **once**, when the row is created. A rate
 * change tomorrow must not rewrite what a sale that already happened was
 * worth, which is the one thing a derived ledger would otherwise get wrong.
 */

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// The chain above somebody
// ---------------------------------------------------------------------------

/** The chain above one affiliate, nearest first. At most two entries. */
export interface Upline {
  level1: string | null;
  level2: string | null;
}

const NO_UPLINE: Upline = { level1: null, level2: null };

/**
 * Who is above this affiliate.
 *
 * Walked at read time rather than stored, because the only thing stored is the
 * one relationship each affiliate has — their own recruiter. Two levels, and
 * the programme stops there: a chain that pays five levels up is a chain
 * nobody can price a sale against.
 */
export async function getUpline(affiliateId: string): Promise<Upline> {
  try {
    const self = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: { referredById: true },
    });
    if (!self?.referredById) return NO_UPLINE;
    const parent = await prisma.affiliate.findUnique({
      where: { id: self.referredById },
      select: { id: true, status: true, referredById: true },
    });
    if (!parent) return NO_UPLINE;
    return { level1: parent.id, level2: parent.referredById ?? null };
  } catch {
    return NO_UPLINE;
  }
}

/** Everyone this affiliate recruited, and everyone they recruited. */
export async function getDownlineIds(affiliateId: string): Promise<{ level1: string[]; level2: string[] }> {
  try {
    const direct = await prisma.affiliate.findMany({
      where: { referredById: affiliateId },
      select: { id: true },
    });
    const level1 = direct.map((d) => d.id);
    if (level1.length === 0) return { level1, level2: [] };
    const indirect = await prisma.affiliate.findMany({
      where: { referredById: { in: level1 } },
      select: { id: true },
    });
    return { level1, level2: indirect.map((d) => d.id) };
  } catch {
    return { level1: [], level2: [] };
  }
}

/** Which level of this affiliate's team somebody is on, or null. */
export async function teamLevelFor(
  leaderId: string,
  memberId: string,
): Promise<1 | 2 | null> {
  const { level1, level2 } = await getDownlineIds(leaderId);
  if (level1.includes(memberId)) return 1;
  if (level2.includes(memberId)) return 2;
  return null;
}

// ---------------------------------------------------------------------------
// Referral codes
// ---------------------------------------------------------------------------

export type ReferralCodeCheck =
  | { ok: true; affiliate: { id: string; name: string; code: string } }
  | { ok: false; reason: string };

/**
 * Whose code is this?
 *
 * An affiliate's own referral code is the code they already share links with —
 * one code per person, which is the only thing somebody can read out over the
 * phone. Case and spacing are forgiven because it arrives off a flyer.
 */
export async function resolveReferralCode(raw: string): Promise<ReferralCodeCheck> {
  const code = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return { ok: false, reason: "No referral code." };
  const affiliate = await prisma.affiliate
    .findFirst({
      where: { code: { equals: code, mode: "insensitive" } },
      select: { id: true, name: true, code: true, status: true },
    })
    .catch(() => null);
  if (!affiliate?.code) return { ok: false, reason: "We don't recognise that referral code." };
  if (affiliate.status !== "active") {
    return { ok: false, reason: "That affiliate's account is not active at the moment." };
  }
  return { ok: true, affiliate: { id: affiliate.id, name: affiliate.name, code: affiliate.code } };
}

/**
 * Point one affiliate at their recruiter — once.
 *
 * Guarded on `referralLockedAt` being null rather than checked first, so two
 * approvals racing cannot produce two different recruiters. Once locked,
 * nothing changes it: a commission that has already been paid to one upline
 * cannot be made to have been owed to another.
 */
export async function linkReferral(affiliateId: string, referrerId: string): Promise<boolean> {
  if (affiliateId === referrerId) return false;
  // A chain that loops would pay somebody a share of their own sales.
  const { level1, level2 } = await getUpline(referrerId);
  if (level1 === affiliateId || level2 === affiliateId) return false;
  const done = await prisma.affiliate
    .updateMany({
      where: { id: affiliateId, referralLockedAt: null },
      data: { referredById: referrerId, referralLockedAt: new Date() },
    })
    .catch(() => ({ count: 0 }));
  return done.count > 0;
}

// ---------------------------------------------------------------------------
// Team sales
// ---------------------------------------------------------------------------

/**
 * Bring one order's team earnings into line with its commissions.
 *
 * Called from the same places the commission ledger is reconciled, and under
 * the same contract: derived, idempotent, and writing nothing when nothing has
 * happened. A team earning mirrors its parent commission's status because they
 * are the same money seen twice — if the buyer returns the goods, neither the
 * affiliate nor their upline earned anything on it.
 */
export async function syncTeamEarnings(orderId: string): Promise<void> {
  try {
    const config = await getAffiliateReferralConfig();

    const commissions = await prisma.affiliateCommission.findMany({
      where: { orderId },
      select: {
        id: true,
        affiliateId: true,
        amount: true,
        reversedAmount: true,
        status: true,
        holdUntil: true,
        clearedAt: true,
        affiliate: { select: { name: true, code: true, referredById: true } },
        product: { select: { name: true } },
      },
    });
    if (commissions.length === 0) return;

    for (const row of commissions) {
      const existing = await prisma.affiliateTeamEarning.findMany({
        where: { commissionId: row.id },
        select: { id: true, affiliateId: true, level: true, amount: true, status: true, reversedAmount: true },
      });

      // 1) Create what is missing — but only while the programme is on, and
      //    only for a sale that qualifies. A sale that did not qualify when it
      //    was made never does: the row's absence is the record.
      if (config.enabled && commissionQualifies(row.amount, config.minCommission)) {
        const upline = await getUpline(row.affiliateId);
        for (const level of [1, 2] as const) {
          const earnerId = level === 1 ? upline.level1 : upline.level2;
          if (!earnerId) continue;
          if (existing.some((e) => e.level === level)) continue;
          const percent = teamPercentForLevel(config, level);
          const amount = teamCommissionOn(row.amount, percent);
          if (amount <= 0) continue;
          const earner = await prisma.affiliate
            .findUnique({ where: { id: earnerId }, select: { status: true } })
            .catch(() => null);
          if (!earner || earner.status !== "active") continue;

          await prisma.affiliateTeamEarning
            .create({
              data: {
                affiliateId: earnerId,
                sourceAffiliateId: row.affiliateId,
                kind: "team_sale",
                level,
                commissionId: row.id,
                orderId,
                baseAmount: row.amount,
                rate: percent,
                amount,
                narration: `${row.affiliate.name} earned on ${row.product.name}`,
                status: "pending",
                dedupeKey: `TEAM_SALE:${row.id}:L${level}`,
              },
            })
            // The unique key did its job: somebody else created it first.
            .catch(() => null);
        }
      }

      // 2) Mirror the parent's standing onto whatever rows there are.
      const rows = await prisma.affiliateTeamEarning.findMany({
        where: { commissionId: row.id },
        select: { id: true, amount: true, status: true, reversedAmount: true, clearedAt: true, holdUntil: true },
      });
      const parentReversedAll = row.status === "reversed" || row.reversedAmount >= row.amount;

      for (const earning of rows) {
        // Taken back in the same proportion as the parent. A buyer who
        // returned a third of what they bought cost the upline a third of
        // their share, not all of it.
        const reversedShare =
          row.amount > 0 ? money((earning.amount * row.reversedAmount) / row.amount) : 0;
        const next = parentReversedAll
          ? "reversed"
          : earning.status === "paid"
            ? "paid"
            : row.status;

        const unchanged =
          next === earning.status &&
          money(reversedShare) === money(earning.reversedAmount) &&
          (row.holdUntil?.getTime() ?? null) === (earning.holdUntil?.getTime() ?? null);
        if (unchanged) continue;

        await prisma.affiliateTeamEarning
          .update({
            where: { id: earning.id },
            data: {
              status: next,
              holdUntil: row.holdUntil,
              clearedAt:
                next === "cleared" || next === "paid"
                  ? (earning.clearedAt ?? new Date())
                  : next === "reversed"
                    ? earning.clearedAt
                    : null,
              reversedAmount: reversedShare,
              ...(next === "reversed" && earning.status !== "reversed"
                ? { reversedAt: new Date(), reversalReason: "The sale behind it was reversed" }
                : {}),
            },
          })
          .catch(() => {});
      }
    }
  } catch {
    // Pre-migration databases have no team ledger, and an order must never
    // fail to save because of one.
  }
}

/**
 * Clear every team earning whose window has elapsed.
 *
 * The same read-time sweep the commissions get, for the same reason: time
 * passing is the one transition nothing triggers.
 */
export async function clearDueTeamEarnings(affiliateId?: string): Promise<number> {
  try {
    const result = await prisma.affiliateTeamEarning.updateMany({
      where: {
        ...(affiliateId ? { affiliateId } : {}),
        status: "clearing",
        holdUntil: { lte: new Date() },
        payoutId: null,
      },
      data: { status: "cleared", clearedAt: new Date() },
    });
    return result.count;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Joining rewards
// ---------------------------------------------------------------------------

/**
 * Pay the uplines for a registration that has actually been paid.
 *
 * Called from wherever a registration fee settles, and from nowhere else: the
 * fee being paid is the whole condition. A waived fee pays nobody unless the
 * admin has said a full waiver still counts, because a reward for a
 * registration nobody paid for is what makes inventing recruits profitable.
 */
export async function releaseJoiningRewards(affiliateId: string): Promise<number> {
  try {
    const config = await getAffiliateReferralConfig();
    if (!config.enabled) return 0;

    const recruit = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: {
        id: true,
        name: true,
        code: true,
        registrationPaidAt: true,
        registrationMethod: true,
        registrationFee: true,
        registrationGross: true,
        registrationWaiverPercent: true,
        registrationSettledBy: true,
      },
    });
    if (!recruit?.registrationPaidAt) return 0;

    const mayReward = feeCanReward({
      method: recruit.registrationMethod,
      payable: recruit.registrationFee,
      gross: recruit.registrationGross,
      waiverPercent: recruit.registrationWaiverPercent,
      fullWaiverPaysReward: config.fullWaiverPaysReward,
      settledBy: recruit.registrationSettledBy as
        | "PAYMENT"
        | "COMMISSION"
        | "ADJUSTMENT"
        | "WAIVED"
        | null,
    });
    if (!mayReward) return 0;

    const upline = await getUpline(affiliateId);
    let paid = 0;
    for (const level of [1, 2] as const) {
      const earnerId = level === 1 ? upline.level1 : upline.level2;
      if (!earnerId) continue;
      const amount = rewardForLevel(config, level);
      if (amount <= 0) continue;
      const earner = await prisma.affiliate
        .findUnique({ where: { id: earnerId }, select: { status: true } })
        .catch(() => null);
      if (!earner || earner.status !== "active") continue;

      const created = await prisma.affiliateTeamEarning
        .create({
          data: {
            affiliateId: earnerId,
            sourceAffiliateId: affiliateId,
            kind: "recruit_joined",
            level,
            baseAmount: recruit.registrationFee,
            rate: 0,
            amount,
            narration:
              level === 1
                ? `${recruit.name} joined on your referral`
                : `${recruit.name} joined through your team`,
            // A joining reward has no order to be returned, so there is
            // nothing to hold it for: it is payable the moment it is earned.
            status: "cleared",
            clearedAt: new Date(),
            dedupeKey: `RECRUIT:${affiliateId}:L${level}`,
          },
        })
        .catch(() => null);
      if (created) paid += 1;
    }
    return paid;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// What a team is worth
// ---------------------------------------------------------------------------

export interface TeamBalance {
  /** Still tied to an order that has not been delivered. */
  pending: number;
  /** Delivered, inside the return window. */
  clearing: number;
  /** Payable right now. */
  cleared: number;
  paid: number;
  reversed: number;
  /** Everything live, however far along. */
  earned: number;
  /** Of that, what joining rewards accounted for. */
  rewards: number;
  /** And what team sales accounted for. */
  sales: number;
  lines: number;
}

export const EMPTY_TEAM_BALANCE: TeamBalance = {
  pending: 0,
  clearing: 0,
  cleared: 0,
  paid: 0,
  reversed: 0,
  earned: 0,
  rewards: 0,
  sales: 0,
  lines: 0,
};

/** What this affiliate's team has earned them. */
export async function getTeamBalance(affiliateId: string): Promise<TeamBalance> {
  await clearDueTeamEarnings(affiliateId);
  try {
    const rows = await prisma.affiliateTeamEarning.findMany({
      where: { affiliateId },
      select: { status: true, amount: true, reversedAmount: true, kind: true },
    });
    const balance = { ...EMPTY_TEAM_BALANCE };
    for (const row of rows) {
      const live = money(Math.max(0, row.amount - row.reversedAmount));
      balance.reversed = money(balance.reversed + row.reversedAmount);
      if (row.reversedAmount > 0 && live === 0) continue;
      balance.lines += 1;
      balance.earned = money(balance.earned + live);
      if (row.kind === "recruit_joined") balance.rewards = money(balance.rewards + live);
      else balance.sales = money(balance.sales + live);
      if (row.status === "pending") balance.pending = money(balance.pending + live);
      else if (row.status === "clearing") balance.clearing = money(balance.clearing + live);
      else if (row.status === "cleared") balance.cleared = money(balance.cleared + live);
      else if (row.status === "paid") balance.paid = money(balance.paid + live);
    }
    return balance;
  } catch {
    return { ...EMPTY_TEAM_BALANCE };
  }
}

export interface TeamMember {
  id: string;
  name: string;
  code: string;
  level: 1 | 2;
  status: string;
  joinedAt: Date;
  /** Whether they have paid what they owed to join. */
  registrationPaid: boolean;
  /** Their own recruits. */
  recruits: number;
  /** What their selling has earned this affiliate. */
  earnedForYou: number;
  /** What they have earned themselves. */
  theirEarnings: number;
  lastSaleAt: Date | null;
}

export interface TeamSummary {
  members: TeamMember[];
  level1: number;
  level2: number;
  active: number;
  /** Recruits whose registration fee is still outstanding. */
  awaitingPayment: number;
  balance: TeamBalance;
  /** The link they recruit with. Empty when they have no code yet. */
  code: string;
}

/**
 * Everything the My Team screen shows, in one read.
 *
 * Both levels in one list with the level on the row, rather than two lists:
 * the question an affiliate arrives with is "who in my team is actually
 * selling", and splitting it by depth answers a question nobody asked.
 */
export async function getTeamSummary(affiliate: {
  id: string;
  code: string | null;
}): Promise<TeamSummary> {
  const empty: TeamSummary = {
    members: [],
    level1: 0,
    level2: 0,
    active: 0,
    awaitingPayment: 0,
    balance: { ...EMPTY_TEAM_BALANCE },
    code: affiliate.code ?? "",
  };

  try {
    const [{ level1, level2 }, balance] = await Promise.all([
      getDownlineIds(affiliate.id),
      getTeamBalance(affiliate.id),
    ]);
    const ids = [...level1, ...level2];
    if (ids.length === 0) return { ...empty, balance };

    const [rows, earnings, theirs] = await Promise.all([
      prisma.affiliate.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          createdAt: true,
          registrationPaidAt: true,
          registrationFee: true,
          _count: { select: { recruits: true } },
        },
      }),
      prisma.affiliateTeamEarning.groupBy({
        by: ["sourceAffiliateId"],
        where: { affiliateId: affiliate.id, sourceAffiliateId: { in: ids } },
        _sum: { amount: true, reversedAmount: true },
        _max: { createdAt: true },
      }),
      prisma.affiliateCommission.groupBy({
        by: ["affiliateId"],
        where: { affiliateId: { in: ids }, status: { not: "reversed" } },
        _sum: { amount: true, reversedAmount: true },
      }),
    ]);

    const earnedBy = new Map(
      earnings.map((e) => [
        e.sourceAffiliateId ?? "",
        {
          amount: money((e._sum.amount ?? 0) - (e._sum.reversedAmount ?? 0)),
          last: e._max.createdAt ?? null,
        },
      ]),
    );
    const ownEarnings = new Map(
      theirs.map((t) => [
        t.affiliateId,
        money((t._sum.amount ?? 0) - (t._sum.reversedAmount ?? 0)),
      ]),
    );

    const members: TeamMember[] = rows
      .map((r) => {
        const mine = earnedBy.get(r.id);
        return {
          id: r.id,
          name: r.name,
          code: r.code ?? "",
          level: (level1.includes(r.id) ? 1 : 2) as 1 | 2,
          status: r.status,
          joinedAt: r.createdAt,
          registrationPaid: Boolean(r.registrationPaidAt) || r.registrationFee <= 0,
          recruits: r._count.recruits,
          earnedForYou: mine?.amount ?? 0,
          theirEarnings: ownEarnings.get(r.id) ?? 0,
          lastSaleAt: mine?.last ?? null,
        };
      })
      // Whoever is earning you the most, first. A team screen ordered by date
      // joined tells an affiliate nothing they can act on.
      .sort((a, b) => b.earnedForYou - a.earnedForYou || a.level - b.level);

    return {
      members,
      level1: level1.length,
      level2: level2.length,
      active: members.filter((m) => m.status === "active").length,
      awaitingPayment: members.filter((m) => !m.registrationPaid).length,
      balance,
      code: affiliate.code ?? "",
    };
  } catch {
    return empty;
  }
}
