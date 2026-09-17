import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { ApplicationReview } from "@/components/admin/ApplicationReview";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { formatWhen } from "@/components/agent/AgentUi";
import { formatMoney } from "@/lib/format";
import { dataDb } from "@/lib/data-db";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Agent applications — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The queue: people who have asked to sell and are waiting on a decision.
 *
 * Its own tab rather than a block above the roster, because it is the only
 * screen in this module that needs a judgement rather than a look — and one
 * that was easy to scroll past when it sat on top of a table of agents.
 */
export default async function AdminAgentApplicationsPage() {
  const applications = await dataDb.dataAgentApplication
    .findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 50 })
    .catch(() => []);

  return (
    <div>
      <PanelHeading
        title="Applications"
        subtitle="From /become-an-agent and from your registration links."
      />

      {applications.length === 0 ? (
        <div className="rounded-2xl bg-white px-4 py-14 text-center ring-1 ring-niki-edge">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
            <Inbox className="h-5 w-5" />
          </span>
          <p className="mt-3 font-display font-bold text-niki-ink">Nothing waiting</p>
          <p className="mt-1 text-sm text-niki-ink/55">
            Applications land here the moment somebody applies.
          </p>
        </div>
      ) : (
        <div className="stagger-children space-y-3">
          {applications.map((a) => (
            <article key={a.id} className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display font-bold text-niki-ink">{a.fullName}</p>
                  <p className="mt-0.5 text-sm text-niki-ink/65">
                    <a href={`tel:${a.phone}`} className="font-mono hover:text-niki-orange">
                      {a.phone}
                    </a>
                    {" · "}
                    <a href={`mailto:${a.email}`} className="hover:text-niki-orange">
                      {a.email}
                    </a>
                  </p>
                  <p className="mt-1 text-xs text-niki-ink/50">
                    Wants to trade as{" "}
                    <span className="font-semibold text-niki-ink/80">
                      {a.storeName || a.desiredSlug}
                    </span>{" "}
                    at{" "}
                    <span className="font-mono font-semibold text-niki-ink/70">
                      /store/{a.desiredSlug}
                    </span>
                  </p>
                </div>
                <time className="shrink-0 text-xs text-niki-ink/45">{formatWhen(a.createdAt)}</time>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {a.referralCode ? (
                  <span className="rounded-md bg-niki-orange/10 px-3 py-1 font-semibold text-niki-orange">
                    Referred by <span className="font-mono">{a.referralCode}</span>
                    {a.referrerId ? "" : " · code didn't resolve"}
                  </span>
                ) : null}
                {/* Which link brought them in, when it was one of ours. */}
                {a.inviteCode ? (
                  <span className="rounded-md bg-niki-trust/10 px-3 py-1 font-semibold text-niki-trust">
                    Invited by Nickimart <span className="font-mono">{a.inviteCode}</span>
                  </span>
                ) : null}
                {a.feeWaiverPercent > 0 ? (
                  <span className="rounded-md bg-niki-success/10 px-3 py-1 font-semibold text-niki-success">
                    {a.feeWaiverPercent >= 100
                      ? "Fee waived in full"
                      : `${a.feeWaiverPercent}% off the fee`}
                  </span>
                ) : null}
                {/* The one thing that decides whether this can be approved. */}
                <span
                  className={cn(
                    "rounded-md px-3 py-1 font-semibold",
                    a.paymentStatus === "paid"
                      ? "bg-niki-success/10 text-niki-success"
                      : a.paymentStatus === "pending"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-niki-ink/5 text-niki-ink/60",
                  )}
                >
                  {a.paymentStatus === "paid"
                    ? `Paid ${formatMoney(a.feeAmount)}`
                    : a.paymentStatus === "pending"
                      ? `Awaiting ${formatMoney(a.feeAmount)} payment`
                      : a.feeAmount > 0
                        ? "Fee clears from commission"
                        : "Nothing to pay"}
                </span>
              </div>

              {a.note ? (
                <p className="mt-3 rounded-xl bg-niki-surface px-4 py-3 text-sm leading-relaxed text-niki-ink/70">
                  {a.note}
                </p>
              ) : null}

              <div className="mt-4">
                <ApplicationReview
                  id={a.id}
                  blocked={
                    a.paymentStatus === "pending"
                      ? "Can't approve until the registration payment clears"
                      : undefined
                  }
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
