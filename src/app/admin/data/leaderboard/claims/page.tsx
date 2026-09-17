import type { Metadata } from "next";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { formatWhen } from "@/components/agent/AgentUi";
import { formatMoney } from "@/lib/format";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import { dataDb } from "@/lib/data-db";
import { listRedemptions } from "@/lib/data-bundles/points";
import { fulfilRedemption, rejectRedemption } from "@/lib/data-bundles/leaderboard-actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Claims — Leaderboard — Nickimart" };
export const dynamic = "force-dynamic";

/** Points already spent, waiting to be handed over. */
export default async function LeaderboardClaimsPage() {
  const [recent, agentNames] = await Promise.all([
    listRedemptions("all", 30),
    dataDb.dataAgent
      .findMany({ select: { id: true, code: true, storeName: true }, take: 5000 })
      .catch((): Array<{ id: string; code: string; storeName: string }> => []),
  ]);
  const byAgent = new Map(agentNames.map((a) => [a.id, a]));

  return (
    <div>
      <PanelHeading
        title="Claims"
        subtitle="The points were taken when the claim was made, so turning one down puts them straight back."
      />

        {recent.length === 0 ? (
          <p className="rounded-2xl bg-white px-5 py-8 text-center text-sm text-niki-ink/55 ring-1 ring-niki-edge">
            Nothing claimed yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
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
                                className="niki-press rounded-lg bg-niki-success px-3.5 py-1.5 text-xs font-semibold text-white"
                              >
                                {row.kind === "CASH" ? "Credit" : "Sent"}
                              </button>
                            </form>
                            <form action={rejectRedemption}>
                              <input type="hidden" name="id" value={row.id} />
                              <button
                                type="submit"
                                className="niki-press niki-chip rounded-lg px-3.5 py-1.5 text-xs font-semibold text-niki-ink/70"
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
    </div>
  );
}
