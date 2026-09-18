import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { AgentPageHeading } from "@/components/agent/AgentUi";
import { SubAgentForm } from "@/components/agent/SubAgentForm";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getReferralConfig } from "@/lib/data-bundles/settings";
import { quoteRegistrationFee, recruitPaymentRule } from "@/lib/data-bundles/referrals";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Add an agent — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/** Recruiting somebody without leaving the console. */
export default async function AddSubAgentPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const [quote, referral, rule] = await Promise.all([
    quoteRegistrationFee(agent.id),
    getReferralConfig(),
    // What this agent's recruits are allowed to do — the programme's rule, or
    // the exception an admin has written against this agent.
    recruitPaymentRule(agent.id),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <AgentPageHeading
        title="Add an agent"
        subtitle="Take their details once. We send them their sign-in details, and they join the approval queue with you as their recruiter."
      />

      {!referral.enabled ? (
        <p className="rounded-xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          The referral programme is paused, so this registration won&apos;t earn you a joining
          reward. They can still be registered.
        </p>
      ) : null}

      <div className="flex items-center gap-2.5 rounded-2xl bg-niki-black px-5 py-4 text-white">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-niki-orange">
          <UserPlus className="h-4 w-4" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="text-white/70">
            {quote.payable > 0 ? (
              <>
                Your recruits pay{" "}
                <span className="font-bold text-white">{formatMoney(quote.payable)}</span>
                {quote.waiverPercent > 0 ? (
                  <span className="text-white/50"> — {quote.waiverPercent}% off your code</span>
                ) : null}
              </>
            ) : (
              <>
                Your recruits register <span className="font-bold text-white">free</span>.
              </>
            )}
          </p>
          {/*
            Which rule is in force, and whose. An agent given an exception has
            been told about it by whoever gave it to them, and seeing it here is
            how they know it actually arrived — a setting that quietly did not
            take looks exactly like one that was never made.
          */}
          {quote.payable > 0 ? (
            <p className="mt-0.5 text-xs text-white/45">
              {rule.mode === "UPFRONT"
                ? "Paid up front"
                : rule.mode === "COMMISSION"
                  ? "Cleared from their commission"
                  : "You choose how it's settled"}
              {rule.source === "agent" ? " — set for you by Nickimart" : ""}
            </p>
          ) : null}
        </div>
      </div>

      <SubAgentForm
        payable={quote.payable}
        fullFee={quote.gross}
        waiverPercent={quote.waiverPercent}
        canPayNow={rule.mode !== "COMMISSION"}
        canPayFromCommission={rule.mode !== "UPFRONT"}
      />
    </div>
  );
}
