import type { Metadata } from "next";
import { Clock, Gift, Users, Wallet } from "lucide-react";
import { RecruitLinkCard } from "@/components/affiliate/RecruitLinkCard";
import { InviteRecruitForm } from "@/components/affiliate/InviteRecruitForm";
import { SubmitButton } from "@/components/ui/motion";
import { payRegistrationFee } from "@/lib/affiliate-console-actions";
import { getAffiliateWorkspace } from "@/lib/affiliate-console";
import { getAffiliateReferralConfig } from "@/lib/affiliate-settings";
import { getTeamSummary } from "@/lib/affiliate-team";
import { registrationStatus } from "@/lib/affiliate-registration";
import { affiliateReferralLink, teamRewardsLine } from "@/lib/affiliate-team-rules";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { siteUrl } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "My team — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-3 py-3 align-middle";

/**
 * The affiliate's own team.
 *
 * Two things earn here and they are paid at different moments: a share of what
 * a recruit earns, every time they earn it, and a one-off reward when somebody
 * joins and settles their registration. The screen says both, because an
 * affiliate who has been told only about the reward feels misled by a
 * programme that was being honest.
 *
 * Ordered by what each member has earned *them* rather than by date joined: a
 * team screen sorted by when people arrived tells nobody anything they can act
 * on.
 */
export default async function AffiliateTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ fee?: string }>;
}) {
  const [{ fee }, user] = await Promise.all([searchParams, requireUser()]);
  const workspace = await getAffiliateWorkspace({ id: user.id, role: user.role });
  const affiliate = workspace.affiliate;
  if (!affiliate) return null;

  const [config, summary, row] = await Promise.all([
    getAffiliateReferralConfig(),
    getTeamSummary({ id: affiliate.id, code: affiliate.code }),
    prisma.affiliate.findUnique({
      where: { id: affiliate.id },
      select: {
        registrationFee: true,
        registrationMethod: true,
        registrationPaidAt: true,
        registrationOwed: true,
        referredBy: { select: { name: true } },
      },
    }),
  ]);

  const registration = row
    ? registrationStatus(row)
    : { amount: 0, method: "WAIVED", paid: true, outstanding: 0, payable: false };
  const link = summary.code ? affiliateReferralLink(siteUrl(), summary.code) : "";
  const rewards = teamRewardsLine(config);

  return (
    <div>
      <header>
        <h1 className="font-display text-xl font-bold text-niki-ink sm:text-2xl">My team</h1>
        <p className="mt-1 text-sm text-niki-ink/60">{rewards}</p>
      </header>

      {fee === "paid" ? (
        <p className="animate-fade-up mt-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/30">
          Your registration fee is paid. Nothing is held back from your commission any more.
        </p>
      ) : null}
      {fee === "error" ? (
        <p className="animate-fade-up mt-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger ring-1 ring-niki-danger/30">
          We couldn&apos;t open the checkout. Your fee is still clearing out of your commission, so
          nothing is at risk — try again in a moment.
        </p>
      ) : null}
      {fee === "pending" ? (
        <p className="animate-fade-up mt-4 rounded-xl bg-niki-gold/15 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-niki-gold/30">
          We haven&apos;t had confirmation from the payment gateway yet. It usually lands within a
          minute — this page will show it as paid.
        </p>
      ) : null}

      {!config.enabled ? (
        <p className="mt-4 rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/65">
          Recruiting is paused at the moment. Anything your team has already earned you is
          unaffected and still pays out.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="In your team" value={String(summary.level1 + summary.level2)} note={`${summary.level1} you recruited`} icon={Users} />
            <Tile label="Payable now" value={formatMoney(summary.balance.cleared)} note="From your team" icon={Wallet} tone={summary.balance.cleared > 0 ? "success" : "ink"} />
            <Tile label="On the way" value={formatMoney(summary.balance.pending + summary.balance.clearing)} note="Still clearing" icon={Clock} />
            <Tile label="Joining rewards" value={formatMoney(summary.balance.rewards)} note="Earned for recruiting" icon={Gift} />
          </div>

          <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
            <h2 className="font-display font-bold text-niki-ink">Your team</h2>
            {summary.members.length === 0 ? (
              <p className="mt-3 rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
                Nobody yet. Share your link and whoever joins through it is on your team.
              </p>
            ) : (
              <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-niki-surface/70">
                      <th className={`${th} rounded-l-lg`}>Who</th>
                      <th className={th}>Level</th>
                      <th className={th}>They earned</th>
                      <th className={`${th} rounded-r-lg`}>You earned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.members.map((m) => (
                      <tr key={m.id} className="border-b border-niki-edge last:border-0">
                        <td className={td}>
                          <p className="font-semibold text-niki-ink">{m.name}</p>
                          <p className="text-[11px] text-niki-ink/45">
                            {m.status === "active" ? "Active" : m.status}
                            {m.recruits > 0 ? ` · ${m.recruits} recruited` : ""}
                            {!m.registrationPaid ? " · fee outstanding" : ""}
                          </p>
                        </td>
                        <td className={`${td} text-niki-ink/65`}>
                          {m.level === 1 ? "Yours" : "Their recruit"}
                        </td>
                        <td className={`${td} text-niki-ink/65`}>{formatMoney(m.theirEarnings)}</td>
                        <td className={cn(td, "font-semibold")}>
                          {m.earnedForYou > 0 ? (
                            formatMoney(m.earnedForYou)
                          ) : (
                            <span className="font-normal text-niki-ink/35">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {link ? (
            <RecruitLinkCard
              link={link}
              code={summary.code}
              pitch={config.pitch}
              rewards={rewards}
              paused={!config.enabled || affiliate.status !== "active"}
            />
          ) : (
            <div className="rounded-2xl bg-niki-surface p-5 text-sm text-niki-ink/65">
              Set your referral code in Settings and your recruiting link appears here.
            </div>
          )}

          {link && config.enabled && affiliate.status === "active" ? (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <p className="font-display font-bold text-niki-ink">Invite someone directly</p>
              <p className="mt-1 mb-3 text-sm text-niki-ink/60">
                We&apos;ll text them your link. They finish the signup themselves.
              </p>
              <InviteRecruitForm />
            </div>
          ) : null}

          {registration.outstanding > 0 ? (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <p className="font-display font-bold text-niki-ink">Your registration fee</p>
              <p className="mt-1 text-sm text-niki-ink/65">
                {formatMoney(registration.outstanding)} of {formatMoney(registration.amount)} is
                still to clear. It comes out of your commission before anything is paid to you —
                there is nothing you have to do.
              </p>
              <form action={payRegistrationFee} className="mt-3">
                <SubmitButton
                  pendingLabel="Opening checkout…"
                  className="rounded-full bg-niki-orange px-4 py-2.5 text-xs font-bold text-white hover:bg-niki-orange-light"
                >
                  Pay {formatMoney(registration.outstanding)} now
                </SubmitButton>
              </form>
            </div>
          ) : null}

          {row?.referredBy ? (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <p className="font-display font-bold text-niki-ink">Who brought you in</p>
              <p className="mt-1 text-sm text-niki-ink/65">{row.referredBy.name}</p>
            </div>
          ) : null}

          {summary.awaitingPayment > 0 ? (
            <p className="rounded-2xl bg-niki-surface px-4 py-3 text-xs leading-relaxed text-niki-ink/60">
              {summary.awaitingPayment} of your recruits still owe their registration fee. Your
              joining reward for them lands once it is settled.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** One figure, with what it is. */
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
  const tones = { ink: "text-niki-ink", success: "text-niki-success", orange: "text-niki-orange" } as const;
  return (
    <div className="rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge sm:p-4">
      <div className="flex items-center gap-1.5 text-niki-ink/50">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-1.5 font-figures text-lg font-bold sm:text-xl ${tones[tone]}`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-niki-ink/45">{note}</p>
    </div>
  );
}
