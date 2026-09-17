import type { Metadata } from "next";
import { Banknote, Plus, Signal } from "lucide-react";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { RewardTierForm } from "@/components/admin/RewardTierForm";
import { formatMoney } from "@/lib/format";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import { getRewardTiers } from "@/lib/data-bundles/points";
import { deleteRewardTier, setRewardTierActive } from "@/lib/data-bundles/leaderboard-actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Rewards — Leaderboard — Nickimart" };
export const dynamic = "force-dynamic";

/** What points buy. Entirely the admin's: the code assumes no tier and no price. */
export default async function LeaderboardRewardsPage() {
  const tiers = await getRewardTiers(true);

  return (
    <div>
      <PanelHeading
        title="The shelf"
        subtitle="What points can be spent on. Cash is credited to the agent's balance when you approve a claim; a data reward is one you send."
      />

        {tiers.length === 0 ? (
          <p className="rounded-2xl bg-white px-5 py-8 text-center text-sm text-niki-ink/55 ring-1 ring-niki-edge">
            No rewards yet. Add the first one below — until then agents collect points with
            nothing to spend them on.
          </p>
        ) : (
          <ul className="space-y-3">
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
                        className="niki-press niki-chip rounded-lg px-3.5 py-1.5 text-xs font-semibold text-niki-ink/75"
                      >
                        {tier.isActive ? "Hide" : "Show"}
                      </button>
                    </form>
                    <form action={deleteRewardTier}>
                      <input type="hidden" name="id" value={tier.id} />
                      <button
                        type="submit"
                        className="niki-press rounded-lg px-3.5 py-1.5 text-xs font-semibold text-niki-danger hover:bg-niki-danger/10"
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
    </div>
  );
}
