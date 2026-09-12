import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Coins, Gift, History, Trophy } from "lucide-react";
import { AgentPageHeading, Card, EmptyRow, formatWhen } from "@/components/agent/AgentUi";
import { BoardCard } from "@/components/agent/LeaderboardUi";
import { RewardsPanel, type RewardTierView } from "@/components/agent/RewardsPanel";
import { requireUser } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getLeaderboardView } from "@/lib/data-bundles/leaderboard";
import { pointsToNextReward } from "@/lib/data-bundles/leaderboard-rules";
import {
  getAgentRedemptions,
  getPointsHistory,
  getRewardTiers,
} from "@/lib/data-bundles/points";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Leaderboard — Agent — Nickimart" };
export const dynamic = "force-dynamic";

const REDEMPTION_TONES: Record<string, string> = {
  pending: "bg-niki-gold/15 text-[#8a5a00]",
  fulfilled: "bg-niki-success/10 text-niki-success",
  rejected: "bg-niki-danger/10 text-niki-danger",
};

/**
 * Sell, rank, earn points, redeem — the whole loop on one screen.
 *
 * One page rather than four, because on a phone the loop only makes sense
 * when the parts are next to each other: the points at the top are what the
 * boards below pay out, and the rewards under them are what the points are
 * for. Splitting them up would turn a story into a menu.
 */
export default async function AgentLeaderboardPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const view = await getLeaderboardView(agent.id);
  // Off is off: an agent should never land on a half-drawn screen for a
  // feature the admin has switched away.
  if (!view.enabled) redirect("/agent");

  const [tiers, history, redemptions] = await Promise.all([
    getRewardTiers(),
    getPointsHistory(agent.id, 12),
    getAgentRedemptions(agent.id, 6),
  ]);

  const balance = agent.pointsBalance;
  const next = pointsToNextReward(balance, tiers.map((t) => t.points));
  const cheapest = tiers.length ? Math.min(...tiers.map((t) => t.points)) : 0;
  // How far along the bar is: from nothing towards whatever is next. With
  // everything already affordable it is simply full.
  const progress = next
    ? Math.min(100, Math.round((balance / Math.max(1, next.next)) * 100))
    : 100;

  const tierViews: RewardTierView[] = tiers.map((t) => ({
    id: t.id,
    label: t.label,
    kind: t.kind,
    points: t.points,
    cashAmount: t.cashAmount,
    network: t.network,
    sizeGb: t.sizeGb,
    detail:
      t.kind === "CASH"
        ? `${formatMoney(t.cashAmount)} to your balance`
        : `${bundleLabel(t.sizeGb)} ${networkLabel(t.network)} sent to any number`,
  }));

  return (
    <div className="space-y-6">
      <AgentPageHeading
        title="Leaderboard"
        subtitle={view.config.pitch || "Sell, climb the board, collect points, cash them in."}
      />

      {/* Points, and what they are worth next. */}
      <section className="overflow-hidden rounded-2xl bg-niki-black p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
              <Coins className="h-3.5 w-3.5" />
              Your points
            </p>
            <p className="mt-1 font-figures text-4xl font-bold text-niki-gold">
              {balance.toLocaleString("en-GH")}
            </p>
          </div>
          <p className="text-sm text-white/70">
            {next
              ? `${next.needed.toLocaleString("en-GH")} points to your next reward`
              : tiers.length > 0
                ? "Every reward on the shelf is within reach."
                : "Rewards are being set up — your points are safe."}
          </p>
        </div>

        {tiers.length > 0 ? (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-niki-gold transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-white/45">
              {next
                ? `Next up at ${next.next.toLocaleString("en-GH")} points`
                : `Cheapest reward: ${cheapest.toLocaleString("en-GH")} points`}
            </p>
          </div>
        ) : null}
      </section>

      {/* The boards. */}
      {view.boards.length === 0 ? (
        <EmptyRow>The boards are being set up. Check back shortly.</EmptyRow>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {view.boards.map((board) => (
            <BoardCard key={board.key} board={board} />
          ))}
        </div>
      )}

      {/* The shelf. */}
      <Card
        title="Rewards"
        description="Spend your points on cash or data"
        icon={Gift}
      >
        <RewardsPanel balance={balance} tiers={tierViews} open={view.config.rewardsEnabled} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Points activity" description="Where your points came from" icon={Trophy}>
          {history.length === 0 ? (
            <EmptyRow>
              Nothing yet. Points land when a ranking period closes and places are paid.
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-niki-edge">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-niki-ink">{entry.narration}</p>
                    <p className="text-[11px] text-niki-ink/45">{formatWhen(entry.createdAt)}</p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 font-figures text-sm font-bold",
                      entry.points < 0 ? "text-niki-ink/50" : "text-niki-success",
                    )}
                  >
                    {entry.points > 0 ? "+" : "−"}
                    {Math.abs(entry.points).toLocaleString("en-GH")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Your rewards" description="What you have claimed" icon={History}>
          {redemptions.length === 0 ? (
            <EmptyRow>Nothing claimed yet.</EmptyRow>
          ) : (
            <ul className="divide-y divide-niki-edge">
              {redemptions.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-niki-ink">{row.label}</p>
                    <p className="text-[11px] text-niki-ink/45">
                      {row.points.toLocaleString("en-GH")} points · {formatWhen(row.createdAt)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
                      REDEMPTION_TONES[row.status] ?? "bg-niki-surface text-niki-ink/60",
                    )}
                  >
                    {row.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
