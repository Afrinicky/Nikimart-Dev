import type { Metadata } from "next";
import { Network, Users, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { BarList } from "@/components/admin/charts/BarList";
import { ActionLink } from "@/components/ui/motion";
import { getReferralOverview } from "@/lib/affiliate-team";
import { getAffiliateReferralConfig } from "@/lib/affiliate-settings";
import { teamRewardsLine } from "@/lib/affiliate-team-rules";
import { requireDashboard } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Teams — Affiliates — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

/**
 * Who recruited whom, and what the programme has paid for it.
 *
 * The question this screen answers is whether recruiting is paying for itself:
 * what has gone out in team earnings and joining rewards against how much of
 * the roster arrived through somebody else's link.
 */
export default async function AdminAffiliateTeamsPage() {
  await requireDashboard("/admin");
  const [overview, config] = await Promise.all([
    getReferralOverview(),
    getAffiliateReferralConfig(),
  ]);

  return (
    <Container className="py-6 sm:py-8">
      <AffiliateModuleHeader />

      <div className="mt-6">
        <PanelHeading
          title="Teams"
          subtitle={teamRewardsLine(config)}
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Tile
            label="Recruited"
            value={String(overview.recruited)}
            note="Arrived through a referral link"
            icon={Users}
          />
          <Tile
            label="Recruiting"
            value={String(overview.recruiters)}
            note="Affiliates with a team of their own"
            icon={Network}
          />
          <Tile
            label="Paid out"
            value={formatMoney(overview.paidOut)}
            note="Team earnings and joining rewards"
            icon={Wallet}
          />
          <Tile
            label="Still owed"
            value={formatMoney(overview.payable)}
            note="Earned, not yet paid"
            icon={Wallet}
            tone={overview.payable > 0 ? "orange" : "ink"}
          />
        </div>

        {overview.feesOutstanding > 0 ? (
          <p className="mt-4 rounded-2xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/65">
            {formatMoney(overview.feesOutstanding)} of registration fees is still clearing out of
            commission. It comes off what those affiliates can withdraw, not out of your pocket.
          </p>
        ) : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            {overview.rows.length === 0 ? (
              <p className="rounded-xl bg-niki-surface px-4 py-10 text-center text-sm text-niki-ink/55">
                Nobody has been recruited yet.
              </p>
            ) : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-niki-surface/70">
                      <th className={`${th} rounded-l-lg`}>Affiliate</th>
                      <th className={th}>Recruited by</th>
                      <th className={th}>Their team</th>
                      <th className={th}>Team earned</th>
                      <th className={th}>Owes</th>
                      <th className={`${th} rounded-r-lg`}>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                      >
                        <td className={td}>
                          <ActionLink
                            href={`/admin/affiliates/${row.id}`}
                            className="font-semibold text-niki-ink hover:text-niki-orange"
                          >
                            {row.name}
                          </ActionLink>
                          <p className="font-mono text-[11px] text-niki-ink/40">{row.code}</p>
                        </td>
                        <td className={`${td} text-niki-ink/70`}>
                          {row.recruiterId ? (
                            <ActionLink
                              href={`/admin/affiliates/${row.recruiterId}`}
                              className="hover:text-niki-orange"
                            >
                              {row.recruiterName}
                            </ActionLink>
                          ) : (
                            <span className="text-niki-ink/35">Came on their own</span>
                          )}
                        </td>
                        <td className={`${td} text-niki-ink/70`}>
                          {row.level1 + row.level2 === 0 ? (
                            <span className="text-niki-ink/35">—</span>
                          ) : (
                            <>
                              {row.level1} direct
                              {row.level2 > 0 ? (
                                <span className="text-niki-ink/45"> · {row.level2} below</span>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className={cn(td, "font-semibold")}>
                          {row.teamEarned > 0 ? (
                            formatMoney(row.teamEarned)
                          ) : (
                            <span className="font-normal text-niki-ink/35">—</span>
                          )}
                        </td>
                        <td className={td}>
                          {row.owes > 0 ? (
                            <span className="font-semibold text-niki-orange">
                              {formatMoney(row.owes)}
                            </span>
                          ) : (
                            <span className="text-niki-ink/35">—</span>
                          )}
                        </td>
                        <td className={`${td} whitespace-nowrap text-niki-ink/55`}>
                          {row.joinedAt.toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="h-fit space-y-4">
            <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <p className="font-display font-bold text-niki-ink">Biggest teams</p>
              <div className="mt-3">
                <BarList
                  rows={overview.top}
                  format={(n) => `${n} ${n === 1 ? "person" : "people"}`}
                  empty="No teams yet."
                />
              </div>
            </div>

            <div className="rounded-2xl bg-niki-black p-5 text-white">
              <p className="font-display font-bold">What a change reaches</p>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                A team earning is priced when the sale is made and a joining reward when the fee is
                paid. Changing a rate under Policy moves what is earned from now on and leaves
                everything already earned exactly as it was promised.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </Container>
  );
}

/** One figure, with what it is and where it came from. */
function Tile({
  label,
  value,
  note,
  icon: Icon,
  tone = "ink",
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ElementType;
  tone?: "ink" | "success" | "orange";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    orange: "text-niki-orange",
  } as const;

  return (
    <div className="rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge sm:p-5">
      <div className="flex items-center gap-1.5 text-niki-ink/50 sm:gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide sm:text-xs">
          {label}
        </span>
      </div>
      <p className={`mt-1.5 font-figures text-lg font-bold sm:mt-2 sm:text-2xl ${tones[tone]}`}>
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-niki-ink/45 sm:text-xs">{note}</p>
    </div>
  );
}
