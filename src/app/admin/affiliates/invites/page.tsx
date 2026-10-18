import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { AffiliateInviteForm } from "@/components/admin/affiliate/AffiliateInviteForm";
import { InviteLink } from "@/components/admin/InviteTools";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { affiliateInviteShareUrl, listAffiliateInvites } from "@/lib/affiliate-invites";
import { inviteProblem, isReservedInviteSlug } from "@/lib/data-bundles/invite-rules";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { removeAffiliateInvite, toggleAffiliateInvite } from "@/lib/affiliate-invite-actions";
import { requireDashboard } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Registration links — Affiliates — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

/**
 * Registration links Nickimart issues itself.
 *
 * Not a referral: nobody recruited the person holding one, so nobody is owed a
 * share of what they pay — the discount is Nickimart's own.
 */
export default async function AdminAffiliateInvitesPage() {
  await requireDashboard("/admin");
  const [invites, policy] = await Promise.all([listAffiliateInvites(), getAffiliatePolicy()]);

  return (
    <Container className="py-6 sm:py-8">
      <AffiliateModuleHeader />

      <div className="mt-6">
        <PanelHeading
          title="Registration links"
          subtitle="Invite affiliates directly, at whatever discount you choose. Nobody earns a referral share on these."
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            {invites.length === 0 ? (
              <p className="rounded-xl bg-niki-surface px-4 py-10 text-center text-sm text-niki-ink/55">
                No links yet. Create one and share it with whoever you want on board.
              </p>
            ) : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-niki-surface/70">
                      <th className={`${th} rounded-l-lg`}>Link</th>
                      <th className={th}>For</th>
                      <th className={th}>Fee</th>
                      <th className={th}>Used</th>
                      <th className={th}>Status</th>
                      <th className={`${th} rounded-r-lg`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((invite) => {
                      const problem = inviteProblem(invite);
                      // What to hand somebody: the short path when the link
                      // has one, because that is the address an advert carries
                      // and the one people will be sharing on.
                      const url = affiliateInviteShareUrl(invite);
                      const payable =
                        Math.round(
                          policy.registrationFee * (1 - invite.waiverPercent / 100) * 100,
                        ) / 100;
                      return (
                        <tr
                          key={invite.id}
                          className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                        >
                          <td className={td}>
                            {invite.slug && !isReservedInviteSlug(invite.slug) ? (
                              <>
                                <p className="font-mono text-sm font-bold text-niki-ink">
                                  /{invite.slug}
                                </p>
                                <p className="max-w-[22rem] truncate text-[11px] text-niki-ink/45">
                                  {url}
                                </p>
                                {/* The code still works, and is still the link
                                    to send to one person, so it stays visible. */}
                                <p className="mt-0.5 font-mono text-[11px] text-niki-ink/35">
                                  {invite.code}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="font-mono text-sm font-bold text-niki-ink">
                                  {invite.code}
                                </p>
                                <p className="max-w-[22rem] truncate text-[11px] text-niki-ink/45">
                                  {url}
                                </p>
                                {invite.slug ? (
                                  // Only reachable when a later release added a
                                  // route with this name: the path now opens
                                  // that page, so the code link is the live one
                                  // and the admin needs to know before an ad runs.
                                  <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                                    /{invite.slug} is now a page on the site — issue a new link
                                    with a different short path
                                  </p>
                                ) : (
                                  <p className="mt-0.5 text-[11px] text-niki-ink/35">
                                    No short path — not usable in an ad
                                  </p>
                                )}
                              </>
                            )}
                          </td>
                          <td className={`${td} text-niki-ink/70`}>{invite.label || "—"}</td>
                          <td className={td}>
                            {invite.waiverPercent >= 100 || payable <= 0 ? (
                              <span className="inline-flex rounded-lg bg-niki-success/10 px-2.5 py-1 text-[11px] font-semibold text-niki-success ring-1 ring-niki-success/30">
                                Free
                              </span>
                            ) : (
                              <span className="font-semibold text-niki-ink">
                                {formatMoney(payable)}
                                {invite.waiverPercent > 0 ? (
                                  <span className="ml-1.5 text-[11px] font-medium text-niki-ink/45">
                                    {invite.waiverPercent}% off
                                  </span>
                                ) : null}
                              </span>
                            )}
                          </td>
                          <td className={`${td} text-niki-ink/70`}>
                            {invite.usedCount}
                            {invite.maxUses > 0 ? ` / ${invite.maxUses}` : ""}
                          </td>
                          <td className={td}>
                            <span
                              className={cn(
                                "inline-flex whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold",
                                problem
                                  ? "bg-niki-ink/10 text-niki-ink/60 ring-1 ring-niki-ink/15"
                                  : "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
                              )}
                            >
                              {problem === "expired"
                                ? "Expired"
                                : problem === "used-up"
                                  ? "Used up"
                                  : problem === "inactive"
                                    ? "Off"
                                    : "Live"}
                            </span>
                          </td>
                          <td className={td}>
                            <div className="flex items-center gap-1.5">
                              <InviteLink url={url} />
                              <form action={toggleAffiliateInvite}>
                                <input type="hidden" name="id" value={invite.id} />
                                <input
                                  type="hidden"
                                  name="active"
                                  value={invite.isActive ? "off" : "on"}
                                />
                                <button
                                  type="submit"
                                  className="niki-press inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold text-niki-ink/60 ring-1 ring-niki-edge hover:bg-niki-black/5"
                                >
                                  {invite.isActive ? "Turn off" : "Turn on"}
                                </button>
                              </form>
                              <DeleteButton
                                action={removeAffiliateInvite}
                                id={invite.id}
                                label="Delete link"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <AffiliateInviteForm origin={siteUrl()} />
            <p className="rounded-2xl bg-niki-surface px-4 py-3 text-xs leading-relaxed text-niki-ink/55">
              A short path is the same link at a plain address —{" "}
              {siteUrl().replace(/^https?:\/\//, "")}/earn — which is what Facebook and WhatsApp
              will accept in an ad. It lands straight on the registration page at this
              link&apos;s fee, and turning the link off, letting it expire or deleting it controls
              the ad exactly as it controls any other link.
            </p>
            <p className="rounded-2xl bg-niki-surface px-4 py-3 text-xs leading-relaxed text-niki-ink/55">
              {policy.registrationFee > 0 ? (
                <>
                  The registration fee is {formatMoney(policy.registrationFee)}. A link takes its
                  discount off that when somebody applies, and what they were charged is recorded
                  on their application — so changing the fee later never rewrites a registration
                  that already happened.
                </>
              ) : (
                <>
                  Joining is free at the moment, so a link changes nothing until a registration fee
                  is set under Policy.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
}
