"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { requireAdmin, requireUser } from "@/lib/session";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { formatMoney } from "@/lib/format";
import { bundleLabel, isNetwork, networkLabel } from "@/lib/data-bundles/networks";
import { parseGhPhone } from "@/lib/data-bundles/gh-phone";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getLeaderboardConfig } from "@/lib/data-bundles/settings";
import { postLedgerEntry } from "@/lib/data-bundles/agent-ledger";
import { InsufficientPointsError, postPointEntry } from "@/lib/data-bundles/points";

/**
 * Spending points, and the admin side of the shelf they are spent on.
 *
 * The one rule that matters here is the same one withdrawals follow: points
 * leave the agent the moment a reward is asked for, not when an admin gets
 * round to it. Otherwise the same points buy two rewards while the queue is
 * being worked through. Rejecting a redemption puts them straight back.
 */

export type RewardResult = { ok: true; message: string } | { ok: false; error: string };
export type RewardAdminState = { ok?: boolean; error?: string; message?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function revalidateRewards(agentId?: string) {
  revalidatePath("/agent");
  revalidatePath("/agent/leaderboard");
  revalidatePath("/agent/wallet");
  revalidatePath("/admin/data/leaderboard");
  if (agentId) revalidatePath(`/admin/data/agents/${agentId}`);
}

// ---------------------------------------------------------------------------
// The agent: spending points
// ---------------------------------------------------------------------------

const redeemSchema = z.object({
  tierId: z.string().min(1, "Pick a reward."),
  /** Where a data reward should be sent. Ignored for a cash one. */
  recipientPhone: z.string().trim().optional(),
});

export async function redeemReward(input: z.infer<typeof redeemSchema>): Promise<RewardResult> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) return { ok: false, error: "You don't have an agent account yet." };
  if (agent.status !== "active") {
    return { ok: false, error: "Your agent account is suspended. Please contact support." };
  }

  const config = await getLeaderboardConfig();
  if (!config.enabled || !config.rewardsEnabled) {
    return { ok: false, error: "Rewards aren't open at the moment." };
  }

  const parsed = redeemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please pick a reward." };
  }

  const limit = await rateLimit(`agent-redeem:${agent.id}`, 10, 60 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many requests. Please try again in ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  const tier = await dataDb.dataRewardTier
    .findUnique({ where: { id: parsed.data.tierId } })
    .catch(() => null);
  if (!tier || !tier.isActive) return { ok: false, error: "That reward is no longer available." };
  if (tier.points <= 0) return { ok: false, error: "That reward isn't ready to claim yet." };

  // Where to send a data reward. Asked for here rather than at fulfilment,
  // because the agent is the one who knows the number.
  let recipientPhone = "";
  if (tier.kind === "BUNDLE") {
    const check = parseGhPhone(parsed.data.recipientPhone ?? "");
    if (!check.ok) return { ok: false, error: `Number to credit: ${check.message}` };
    recipientPhone = check.local;
  }

  if (agent.pointsBalance < tier.points) {
    return {
      ok: false,
      error: `You need ${tier.points - agent.pointsBalance} more points for that reward.`,
    };
  }

  try {
    await dataDb.$transaction(async (tx) => {
      const row = await tx.dataRewardRedemption.create({
        data: {
          agentId: agent.id,
          tierId: tier.id,
          // Snapshotted, so retiring or repricing the reward later never
          // rewrites what this agent redeemed.
          label: tier.label,
          kind: tier.kind,
          points: tier.points,
          cashAmount: tier.cashAmount,
          network: tier.network,
          sizeGb: tier.sizeGb,
          recipientPhone,
        },
      });
      // The balance is re-tested inside the debit itself: the check above is
      // for the error message, this is what stops two requests sent together
      // both spending the same points.
      await postPointEntry(
        {
          agentId: agent.id,
          type: "REDEMPTION",
          points: -tier.points,
          requirePoints: tier.points,
          narration: `Redeemed — ${tier.label}`,
        },
        tx,
      );
      return row;
    });
  } catch (err) {
    if (err instanceof InsufficientPointsError) {
      return { ok: false, error: "Your points changed while that was going through. Try again." };
    }
    return { ok: false, error: "Could not claim that reward. Please try again." };
  }

  revalidateRewards();
  return {
    ok: true,
    message:
      tier.kind === "CASH"
        ? `Claimed. ${formatMoney(tier.cashAmount)} will land on your balance once it is approved.`
        : `Claimed. Your ${bundleLabel(tier.sizeGb)} ${networkLabel(tier.network)} will be sent to ${recipientPhone}.`,
  };
}

// ---------------------------------------------------------------------------
// The admin: the shelf
// ---------------------------------------------------------------------------

/**
 * Create or edit a reward.
 *
 * Nothing about a reward is fixed in the code — its name, its price in points,
 * whether it pays cedis or data, and whether it is on the shelf at all are all
 * here. A cash reward needs an amount and a data reward needs a bundle;
 * neither is assumed.
 */
export async function saveRewardTier(
  _prev: RewardAdminState,
  fd: FormData,
): Promise<RewardAdminState> {
  await requireAdmin();

  const id = str(fd, "id");
  const label = str(fd, "label");
  const kind = str(fd, "kind") === "BUNDLE" ? "BUNDLE" : "CASH";
  const points = Math.round(Number(str(fd, "points") || 0));
  const cashAmount = round2(Number(str(fd, "cashAmount") || 0));
  const network = str(fd, "network");
  const sizeGb = Number(str(fd, "sizeGb") || 0);
  const order = Math.round(Number(str(fd, "order") || 0));
  const isActive = str(fd, "isActive") !== "0";

  if (label.length < 2) return { error: "Give the reward a name." };
  if (!Number.isFinite(points) || points <= 0) {
    return { error: "Set what the reward costs in points." };
  }
  if (kind === "CASH" && (!Number.isFinite(cashAmount) || cashAmount <= 0)) {
    return { error: "Set the cash amount this reward pays." };
  }
  if (kind === "BUNDLE" && (!isNetwork(network) || !Number.isFinite(sizeGb) || sizeGb <= 0)) {
    return { error: "Pick the network and bundle size this reward gives." };
  }

  const data = {
    label: label.slice(0, 60),
    kind,
    points,
    cashAmount: kind === "CASH" ? cashAmount : 0,
    network: kind === "BUNDLE" ? network : "",
    sizeGb: kind === "BUNDLE" ? sizeGb : 0,
    order: Number.isFinite(order) ? order : 0,
    isActive,
  };

  try {
    if (id) await dataDb.dataRewardTier.update({ where: { id }, data });
    else await dataDb.dataRewardTier.create({ data });
  } catch {
    return { error: "Couldn't save that reward. Please try again." };
  }

  revalidateRewards();
  return { ok: true, message: id ? "Reward updated." : "Reward added." };
}

/** Take a reward off the shelf, or put it back. */
export async function setRewardTierActive(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  await dataDb.dataRewardTier
    .update({ where: { id }, data: { isActive: str(fd, "isActive") === "1" } })
    .catch(() => {});
  revalidateRewards();
}

/**
 * Delete a reward outright.
 *
 * Redemptions of it survive: they carry their own copy of what was claimed, so
 * an agent's history still reads correctly after the reward is gone.
 */
export async function deleteRewardTier(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  await dataDb.dataRewardTier.delete({ where: { id } }).catch(() => {});
  revalidateRewards();
}

// ---------------------------------------------------------------------------
// The admin: the queue
// ---------------------------------------------------------------------------

/**
 * Hand over a redeemed reward.
 *
 * A cash reward is credited to the agent's balance here, through the ledger
 * like every other credit, so it can be withdrawn to MoMo the usual way. A
 * data reward is sent by the admin — marking it fulfilled records that they
 * did. Either way the points were already spent when it was claimed.
 */
export async function fulfilRedemption(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;

  const row = await dataDb.dataRewardRedemption.findUnique({ where: { id } }).catch(() => null);
  if (!row || row.status !== "pending") return;

  // Guarded, so two admins clicking together credit the balance once.
  const claimed = await dataDb.dataRewardRedemption
    .updateMany({
      where: { id, status: "pending" },
      data: {
        status: "fulfilled",
        processedBy: admin.name ?? admin.email ?? admin.id,
        processedAt: new Date(),
        adminNote: str(fd, "adminNote"),
      },
    })
    .catch(() => ({ count: 0 }));
  if (claimed.count === 0) return;

  if (row.kind === "CASH" && row.cashAmount > 0) {
    try {
      await postLedgerEntry({
        agentId: row.agentId,
        type: "REWARD_PAYOUT",
        amount: row.cashAmount,
        narration: `Reward — ${row.label} (${row.points} points)`,
        reference: row.id,
        dedupeKey: `REWARD_PAYOUT:${row.id}`,
      });
    } catch {
      // Already credited, or the ledger refused it. Put the redemption back so
      // it is visibly outstanding rather than silently unpaid.
      await dataDb.dataRewardRedemption
        .updateMany({
          where: { id, status: "fulfilled" },
          data: { status: "pending", processedAt: null },
        })
        .catch(() => {});
    }
  }

  revalidateRewards(row.agentId);
}

/** Turn a redemption down, and give the points back. */
export async function rejectRedemption(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;

  const row = await dataDb.dataRewardRedemption.findUnique({ where: { id } }).catch(() => null);
  if (!row || row.status !== "pending") return;

  const claimed = await dataDb.dataRewardRedemption
    .updateMany({
      where: { id, status: "pending" },
      data: {
        status: "rejected",
        processedBy: admin.name ?? admin.email ?? admin.id,
        processedAt: new Date(),
        adminNote: str(fd, "adminNote"),
      },
    })
    .catch(() => ({ count: 0 }));
  if (claimed.count === 0) return;

  // The points were taken when it was claimed, so they have to come back —
  // keyed on the redemption, so a double rejection refunds once.
  await postPointEntry({
    agentId: row.agentId,
    type: "REFUND",
    points: row.points,
    narration: `Refund — ${row.label} was not approved`,
    dedupeKey: `REDEMPTION_REFUND:${row.id}`,
  }).catch(() => {});

  revalidateRewards(row.agentId);
}
