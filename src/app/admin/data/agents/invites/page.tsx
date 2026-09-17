import type { Metadata } from "next";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { IssueInviteForm, InviteLink } from "@/components/admin/InviteTools";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { listAgentInvites, inviteUrl } from "@/lib/data-bundles/invites";
import { inviteProblem } from "@/lib/data-bundles/invite-rules";
import { getAgentProgramConfig } from "@/lib/data-bundles/settings";
import { removeInvite, toggleInvite } from "@/lib/data-bundles/invite-actions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Registration links — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

export default async function AdminInvitesPage() {
  const [invites, program] = await Promise.all([listAgentInvites(), getAgentProgramConfig()]);

  return (
    <div>
      <PanelHeading
        title="Registration links"
        subtitle="Invite agents directly, at whatever discount you choose. Nobody earns a referral share on these — the discount is Nickimart's, not a recruiter's."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          {invites.length === 0 ? (
            <p className="rounded-xl bg-niki-surface px-4 py-10 text-center text-sm text-niki-ink/55">
              No links yet. Create one and share it with whoever you want on board.
            </p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
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
                    const url = inviteUrl(invite.code);
                    const payable =
                      Math.round(program.setupFee * (1 - invite.waiverPercent / 100) * 100) / 100;
                    return (
                      <tr
                        key={invite.id}
                        className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                      >
                        <td className={td}>
                          <p className="font-mono text-sm font-bold text-niki-ink">{invite.code}</p>
                          <p className="max-w-[22rem] truncate text-[11px] text-niki-ink/45">
                            {url}
                          </p>
                        </td>
                        <td className={`${td} text-niki-ink/70`}>{invite.label || "—"}</td>
                        <td className={td}>
                          {invite.waiverPercent >= 100 ? (
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
                            <form action={toggleInvite}>
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
                              action={removeInvite}
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
          <IssueInviteForm />
          <p className="rounded-2xl bg-niki-surface px-4 py-3 text-xs leading-relaxed text-niki-ink/55">
            The registration fee is {formatMoney(program.setupFee)}. A link takes its discount off
            that at the moment somebody applies, and what they were charged is recorded on their
            application — so changing the fee later never rewrites a registration that already
            happened.
          </p>
        </div>
      </div>
    </div>
  );
}
