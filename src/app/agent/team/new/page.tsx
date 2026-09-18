import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { AgentPageHeading } from "@/components/agent/AgentUi";
import { SubAgentForm } from "@/components/agent/SubAgentForm";
import { requireUser } from "@/lib/session";
import { getAgentForUser, getAgentWallet, withdrawableFrom } from "@/lib/data-bundles/agents";
import { getReferralConfig } from "@/lib/data-bundles/settings";
import { quoteRegistrationFee } from "@/lib/data-bundles/referrals";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Add an agent — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/** Recruiting somebody without leaving the console. */
export default async function AddSubAgentPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const [quote, wallet, referral] = await Promise.all([
    quoteRegistrationFee(agent.id),
    getAgentWallet(agent),
    getReferralConfig(),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <AgentPageHeading
        title="Add an agent"
        subtitle="Register somebody into your team. They join the approval queue with you as their recruiter."
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
        <p className="text-sm text-white/70">
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
      </div>

      <SubAgentForm payable={quote.payable} walletAvailable={withdrawableFrom(wallet)} />
    </div>
  );
}
