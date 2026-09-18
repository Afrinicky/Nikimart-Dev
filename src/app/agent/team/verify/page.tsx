import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentPageHeading } from "@/components/agent/AgentUi";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { isRegistrationReference } from "@/lib/data-bundles/reference";
import { verifyAndSettleApplicationFee } from "@/lib/data-bundles/registration-fee";

export const metadata: Metadata = { title: "Registration paid — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Where Paystack returns an agent who has just paid for somebody they
 * registered.
 *
 * Inside the console, deliberately: the old flow sent them to a public page
 * and left them to find their way back. The webhook settles the same payment
 * independently, so this is "have we seen it yet", not "did it work".
 */
export default async function TeamPaymentVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const params = await searchParams;
  const reference = (params.reference || params.trxref || "").trim();
  if (!reference || !isRegistrationReference(reference)) redirect("/agent/team");

  let paid = false;
  try {
    paid = await verifyAndSettleApplicationFee(reference);
  } catch {
    // Couldn't reach Paystack. The webhook settles it independently.
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <AgentPageHeading title="Registration payment" subtitle="Paying for an agent you registered." />

      <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-niki-edge">
        <span
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${
            paid ? "bg-niki-success/10 text-niki-success" : "bg-amber-100 text-amber-700"
          }`}
        >
          {paid ? <Check className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
        </span>

        <p className="mt-3 font-display text-lg font-bold text-niki-ink">
          {paid ? "Payment received" : "Payment is still processing"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/65">
          {paid
            ? "Their registration is paid and waiting for approval. They set their password on the link we sent them."
            : "We haven't seen this confirmed yet. If it went through it will land shortly — nothing needs paying again."}
        </p>

        <p className="mt-4 font-mono text-xs text-niki-ink/40">{reference}</p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <ActionLink
            href="/agent/team"
            className="niki-press rounded-xl bg-niki-black px-5 py-2.5 text-sm font-bold text-white"
          >
            My team
          </ActionLink>
          <ActionLink
            href="/agent/team/new"
            className="niki-chip niki-press rounded-xl px-5 py-2.5 text-sm font-semibold text-niki-ink/75"
          >
            Add another
          </ActionLink>
        </div>
      </div>
    </div>
  );
}
