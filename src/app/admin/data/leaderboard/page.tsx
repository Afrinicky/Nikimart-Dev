import type { Metadata } from "next";
import { Banknote, Gift, Plus, Signal, Trophy } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { BoardCard } from "@/components/agent/LeaderboardUi";
import { LeaderboardSettingsForm } from "@/components/admin/LeaderboardSettingsForm";
import { RewardTierForm } from "@/components/admin/RewardTierForm";
import { formatWhen } from "@/components/agent/AgentUi";
import { dataDb } from "@/lib/data-db";
import { formatMoney } from "@/lib/format";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import { getDataSettings } from "@/lib/data-bundles/settings";
import { getLeaderboardView } from "@/lib/data-bundles/leaderboard";
import { getRewardTiers, listRedemptions } from "@/lib/data-bundles/points";
import {
  deleteRewardTier,
  fulfilRedemption,
  rejectRedemption,
  setRewardTierActive,
} from "@/lib/data-bundles/leaderboard-actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Leaderboard — Data Bundles — Nickimart" };
export const dynamic = "force-dynamic";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-niki-ink/45 sm:text-xs">
        {label}
      </p>
      <p className="mt-2 font-figures text-xl font-bold text-niki-ink sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-niki-ink/50">{hint}</p> : null}
    </div>
  );
}

/**
 * The leaderboard console: what it pays, what it has paid, and what agents
 * are spending it on.
 *
 * The boards at the top are the same ones agents see, drawn from the same
 * count — the only reliable way to tell whether a setting is doing what it
 * looked like it would. Underneath, the settings, the shelf of rewards, and
 * the queue of claims waiting to be handed over.
 */
export default async function AdminLeaderboardPage() {
  const [settings, view, tiers, pending, recent] = await Promise.all([
    getDataSettings(),
    // Nobody's own row is highlighted here: an admin is not on the boards.
    getLeaderboardView(null),
    getRewardTiers(true),
    listRedemptions("pending"),
    listRedemptions("all", 15),
  ]);

  const [pointsAwarded, pointsSpent, agentNames] = await Promise.all([
    dataDb.dataAgentPoint
      .aggregate({ where: { points: { gt: 0 } }, _sum: { points: true } })
      .catch(() => ({ _sum: { points: 0 } })),
    dataDb.dataRewardRedemption
      .aggregate({ where: { status: "fulfilled" }, _sum: { points: true } })
      .catch(() => ({ _sum: { points: 0 } })),
    dataDb.dataAgent
      .findMany({ select: { id: true, code: true, storeName: true }, take: 5000 })
      .catch((): Array<{ id: string; code: string; storeName: string }> => []),
  ]);
  const byAgent = new Map(agentNames.map((a) => [a.id, a]));

  const off = !view.enabled;

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">
            Leaderboard &amp; rewards
          </h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            Sell, rank, earn points, redeem. Counted from the sales and referrals you already
            have — nothing here is a separate score to keep in step.
          </p>
        </div>
      </div>

      {off ? (
        <p className="mt-5 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          The leaderboard is switched off. Agents don&apos;t see it and no points are being
          awarded. Everything already earned is untouched, and turning it on picks up where it
          left off.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label="Points awarded"
          value={(pointsAwarded._sum.points ?? 0).toLocaleString("en-GH")}
          hint="Across every agent, all time"
        />
        <Tile
          label="Points redeemed"
          value={(pointsSpent._sum.points ?? 0).toLocaleString("en-GH")}
          hint="Claims you have handed over"
        />
        <Tile label="Claims waiting" value={String(pending.length)} hint="Points already deducted" />
        <Tile
          label="Rewards on the shelf"
          value={String(tiers.filter((t) => t.isActive).length)}
          hint={`${tiers.length} set up in total`}
        />
      </div>

      {/* The boards exactly as agents see them. */}
      {view.boards.length > 0 ? (
        <section className="mt-8">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
            <Trophy className="h-5 w-5 text-niki-orange" />
            The boards right now
          </h2>
          <p className="mt-1 text-sm text-niki-ink/60">
            The same count agents see, refreshed about every minute.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {view.boards.map((board) => (
              <BoardCard key={board.key} board={board} limit={5} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold text-niki-ink">Settings</h2>
        <p className="mt-1 mb-4 text-sm text-niki-ink/60">
          Every one of these is read at the moment a board is drawn or a period is paid, so a
          change takes effect on the next one with no deploy.
        </p>
        <LeaderboardSettingsForm settings={settings} />
      </section>

      {/* The shelf. */}
      <section className="mt-10">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
          <Gift className="h-5 w-5 text-niki-orange" />
          Rewards
        </h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          What points can be spent on. A cash reward is credited to the agent&apos;s balance when
          you approve the claim; a data reward is one you send, and marking it fulfilled records
          that you did.
        </p>

        {tiers.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-sm text-niki-ink/55 ring-1 ring-niki-edge">
            No rewards yet. Add the first one below — until then agents collect points with
            nothing to spend them on.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {tiers.map((tier) => (
              <li key={tier.id} className="rounded-2xl bg-white ring-1 ring-niki-edge">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        tier.isActive
                          ? "bg-niki-orange/10 text-niki-orange"
                          : "bg-niki-surface text-niki-ink/35",
                      )}
                    >
                      {tier.kind === "CASH" ? (
                        <Banknote className="h-5 w-5" />
                      ) : (
                        <Signal className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-niki-ink">{tier.label}</p>
                      <p className="text-xs text-niki-ink/55">
                        {tier.kind === "CASH"
                          ? formatMoney(tier.cashAmount)
                          : `${bundleLabel(tier.sizeGb)} ${networkLabel(tier.network)}`}{" "}
                        · {tier.points.toLocaleString("en-GH")} points
                        {tier.isActive ? "" : " · hidden"}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <form action={setRewardTierActive}>
                      <input type="hidden" name="id" value={tier.id} />
                      <input type="hidden" name="isActive" value={tier.isActive ? "0" : "1"} />
                      <button
                        type="submit"
                        className="niki-press niki-chip rounded-full px-3.5 py-1.5 text-xs font-semibold text-niki-ink/75"
                      >
                        {tier.isActive ? "Hide" : "Show"}
                      </button>
                    </form>
                    <form action={deleteRewardTier}>
                      <input type="hidden" name="id" value={tier.id} />
                      <button
                        type="submit"
                        className="niki-press rounded-full px-3.5 py-1.5 text-xs font-semibold text-niki-danger hover:bg-niki-danger/10"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>

                <details className="border-t border-niki-edge/60 px-4 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-niki-ink/60">
                    Edit this reward
                  </summary>
                  <div className="mt-4">
                    <RewardTierForm
                      tier={{
                        id: tier.id,
                        label: tier.label,
                        kind: tier.kind,
                        points: tier.points,
                        cashAmount: tier.cashAmount,
                        network: tier.network,
                        sizeGb: tier.sizeGb,
                        order: tier.order,
                        isActive: tier.isActive,
                      }}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}

        <details className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <summary className="flex cursor-pointer items-center gap-2 font-display font-bold text-niki-ink">
            <Plus className="h-4 w-4 text-niki-orange" />
            Add a reward
          </summary>
          <div className="mt-4">
            <RewardTierForm />
          </div>
        </details>
      </section>

      {/* The queue. */}
      <section className="mt-10">
        <h2 className="font-display text-lg font-bold text-niki-ink">Claims</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          The points were taken when the claim was made, so turning one down puts them straight
          back.
        </p>

        {recent.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-sm text-niki-ink/55 ring-1 ring-niki-edge">
            Nothing claimed yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
                <tr>
                  <th className="px-5 py-3 font-semibold">Agent</th>
                  <th className="px-5 py-3 font-semibold">Reward</th>
                  <th className="px-5 py-3 font-semibold">Send to</th>
                  <th className="px-5 py-3 text-right font-semibold">Points</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => {
                  const agent = byAgent.get(row.agentId);
                  return (
                    <tr key={row.id} className="border-b border-niki-edge/60 last:border-0">
                      <td className="px-5 py-3">
                        <span className="font-semibold text-niki-ink">
                          {agent?.storeName ?? "Agent"}
                        </span>
                        <span className="ml-2 font-mono text-xs text-niki-ink/45">
                          {agent?.code ?? ""}
                        </span>
                        <p className="text-[11px] text-niki-ink/40">{formatWhen(row.createdAt)}</p>
                      </td>
                      <td className="px-5 py-3 text-niki-ink/70">
                        {row.label}
                        <p className="text-[11px] text-niki-ink/45">
                          {row.kind === "CASH"
                            ? formatMoney(row.cashAmount)
                            : `${bundleLabel(row.sizeGb)} ${networkLabel(row.network)}`}
                        </p>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-niki-ink/60">
                        {row.recipientPhone || "—"}
                      </td>
                      <td className="px-5 py-3 text-right font-figures">
                        {row.points.toLocaleString("en-GH")}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "text-xs font-semibold capitalize",
                            row.status === "fulfilled"
                              ? "text-niki-success"
                              : row.status === "rejected"
                                ? "text-niki-danger"
                                : "text-amber-600",
                          )}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {row.status === "pending" ? (
                          <div className="flex justify-end gap-2">
                            <form action={fulfilRedemption}>
                              <input type="hidden" name="id" value={row.id} />
                              <button
                                type="submit"
                                className="niki-press rounded-full bg-niki-success px-3.5 py-1.5 text-xs font-semibold text-white"
                              >
                                {row.kind === "CASH" ? "Credit" : "Sent"}
                              </button>
                            </form>
                            <form action={rejectRedemption}>
                              <input type="hidden" name="id" value={row.id} />
                              <button
                                type="submit"
                                className="niki-press niki-chip rounded-full px-3.5 py-1.5 text-xs font-semibold text-niki-ink/70"
                              >
                                Refund
                              </button>
                            </form>
                          </div>
                        ) : (
                          <p className="text-right text-[11px] text-niki-ink/40">
                            {row.processedAt ? formatWhen(row.processedAt) : "—"}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Container>
  );
}
