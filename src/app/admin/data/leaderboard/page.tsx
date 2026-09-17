import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { BoardCard } from "@/components/agent/LeaderboardUi";
import { dataDb } from "@/lib/data-db";
import { getLeaderboardView } from "@/lib/data-bundles/leaderboard";
import { getRewardTiers, listRedemptions } from "@/lib/data-bundles/points";

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
 * The boards agents are looking at, drawn from the same count they see — the
 * only reliable way to tell whether a rule is doing what it looked like it
 * would.
 */
export default async function AdminLeaderboardPage() {
  const [view, tiers, pending] = await Promise.all([
    // Nobody's own row is highlighted here: an admin is not on the boards.
    getLeaderboardView(null),
    getRewardTiers(true),
    listRedemptions("pending"),
  ]);

  const [pointsAwarded, pointsSpent] = await Promise.all([
    dataDb.dataAgentPoint
      .aggregate({ where: { points: { gt: 0 } }, _sum: { points: true } })
      .catch(() => ({ _sum: { points: 0 } })),
    dataDb.dataRewardRedemption
      .aggregate({ where: { status: "fulfilled" }, _sum: { points: true } })
      .catch(() => ({ _sum: { points: 0 } })),
  ]);

  const off = !view.enabled;

  return (
    <div>
      {off ? (
        <p className="mb-5 rounded-xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          The leaderboard is switched off. Agents don&apos;t see it and no points are being
          awarded. Everything already earned is untouched, and turning it on picks up where it
          left off.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

    </div>
  );
}
