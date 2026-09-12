import type { Metadata } from "next";
import { Share2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { formatMoney } from "@/lib/format";
import { getDataSettings } from "@/lib/data-bundles/settings";
import { getReferralOverview } from "@/lib/data-bundles/referrals";
import { ReferralSettingsForm } from "@/components/admin/ReferralSettingsForm";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Referrals — Data Bundles — Nickimart" };
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
 * The referral programme: what it pays, and what it has paid.
 *
 * The settings are the point of the screen — every commission is calculated
 * from them at the moment it is earned, so changing one here changes the next
 * payout with no deploy. The table underneath is what those settings have
 * actually done, which is the only way to tell whether a number is right.
 */
export default async function AdminReferralsPage() {
  const [settings, overview] = await Promise.all([getDataSettings(), getReferralOverview()]);
  const closed = ["0", "off", "false", "no"].includes(settings.referralEnabled.trim().toLowerCase());

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Referrals &amp; team earnings</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            Agents recruit agents with their own agent code. Two levels, and no further.
          </p>
        </div>
        <ActionLink
          href="/admin/data/agents"
          className="rounded-full bg-niki-black px-4 py-2 text-xs font-semibold text-white"
        >
          Agent roster
        </ActionLink>
      </div>

      {closed ? (
        <p className="mt-5 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          The referral programme is closed. No new relationships are recorded and nothing is paid.
          Relationships already recorded, and everything already earned, are untouched.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label="Referral earnings paid"
          value={formatMoney(overview.totalRewardsPaid)}
          hint="Joining rewards and recruiters' shares of registration fees"
        />
        <Tile label="Team commission paid" value={formatMoney(overview.totalTeamCommissionPaid)} />
        <Tile
          label="Team commission pending"
          value={formatMoney(overview.pendingTeamCommission)}
          hint="Credited once the bundle is delivered"
        />
        <Tile
          label="Awaiting registration"
          value={String(overview.awaitingRegistration)}
          hint="Recruits whose fee hasn't been paid — nothing is owed on them yet"
        />
      </div>

      <div className="mt-8">
        <ReferralSettingsForm settings={settings} />
      </div>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold text-niki-ink">Who recruited whom</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Every agent the programme touches — recruited, recruiting, or both.
        </p>

        {overview.rows.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-white p-8 text-center ring-1 ring-niki-edge">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
              <Share2 className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-niki-ink">Nobody has been referred yet.</p>
            <p className="mt-1 text-sm text-niki-ink/60">
              Agents share their own agent code. As soon as one of them recruits somebody, they
              appear here.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
                <tr>
                  <th className="px-5 py-3 font-semibold">Agent</th>
                  <th className="px-5 py-3 font-semibold">Recruited by</th>
                  <th className="px-5 py-3 font-semibold">Registration</th>
                  <th className="px-5 py-3 text-right font-semibold">Recruits</th>
                  <th className="px-5 py-3 text-right font-semibold">Referral earnings</th>
                  <th className="px-5 py-3 text-right font-semibold">Team commission</th>
                </tr>
              </thead>
              <tbody>
                {overview.rows.map((row) => (
                  <tr key={row.id} className="border-b border-niki-edge/60 last:border-0">
                    <td className="px-5 py-3">
                      <ActionLink
                        href={`/admin/data/agents/${row.id}`}
                        className="font-semibold text-niki-ink hover:text-niki-orange"
                      >
                        {row.storeName}
                      </ActionLink>
                      <span className="ml-2 font-mono text-xs text-niki-ink/45">{row.code}</span>
                      {row.status !== "active" ? (
                        <span className="ml-2 text-xs text-niki-danger">suspended</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-niki-ink/70">
                      {row.referrerCode ? (
                        <>
                          {row.referrerName}
                          <span className="ml-2 font-mono text-xs text-niki-ink/45">
                            {row.referrerCode}
                          </span>
                        </>
                      ) : (
                        <span className="text-niki-ink/35">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {row.registrationMethod === "WAIVED" ? (
                        <span className="text-xs text-niki-ink/50">Waived — nothing to pay</span>
                      ) : (
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            row.registrationPaid ? "text-niki-success" : "text-amber-600",
                          )}
                        >
                          {row.registrationPaid ? "Paid" : "Outstanding"}
                          <span className="ml-1.5 font-normal text-niki-ink/45">
                            {row.registrationMethod === "UPFRONT" ? "up front" : "from commission"}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-figures">{row.directRecruits}</td>
                    <td className="px-5 py-3 text-right font-figures">
                      {formatMoney(row.referralEarnings)}
                    </td>
                    <td className="px-5 py-3 text-right font-figures">
                      {formatMoney(row.teamSalesEarnings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Container>
  );
}
