"use client";

import { useActionState } from "react";
import { Share2 } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { setAgentReferrer, type AgentAdminState } from "@/lib/data-bundles/agent-admin-actions";

/**
 * Who recruited this agent.
 *
 * Read-only once it is set, and that is the point rather than an omission: a
 * referrer decides who earns from everything this agent ever sells, and money
 * has usually already moved on it. Changing it would move earnings that have
 * been paid, and leave two agents with a different story about the same ledger.
 *
 * The form only appears when there is nothing there — the one real gap, which
 * is somebody who was recruited and forgot to type the code when they applied.
 */
export function ReferrerTool({
  agentId,
  referrer,
  recruits,
}: {
  agentId: string;
  referrer: { code: string; storeName: string } | null;
  /** How many agents this one has recruited. */
  recruits: number;
}) {
  const [state, formAction] = useActionState<AgentAdminState, FormData>(setAgentReferrer, {});

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <Share2 className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display font-bold text-niki-ink">Referral</h2>
          <p className="text-xs text-niki-ink/55">
            {recruits === 0
              ? "Hasn't recruited anyone yet"
              : `Has recruited ${recruits} ${recruits === 1 ? "agent" : "agents"}`}
          </p>
        </div>
      </div>

      {referrer || state.ok ? (
        <p className="mt-4 rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/70">
          {state.ok ? (
            state.message
          ) : (
            <>
              Recruited by{" "}
              <span className="font-semibold text-niki-ink">{referrer!.storeName}</span>{" "}
              <span className="font-mono text-xs text-niki-ink/50">{referrer!.code}</span>
            </>
          )}
          <span className="mt-1 block text-xs text-niki-ink/45">
            Permanent. A referrer decides who earns from this agent&apos;s sales, and changing it
            would move money that has already been paid.
          </span>
        </p>
      ) : (
        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="agentId" value={agentId} />
          <p className="text-sm text-niki-ink/60">
            Nobody is recorded as having recruited this agent. If somebody did and the code was
            missed at signup, add it here — once.
          </p>
          <input
            name="referralCode"
            placeholder="Referrer's agent code, e.g. NKM4821"
            maxLength={20}
            autoCapitalize="characters"
            className={`${inputClass} font-mono uppercase`}
          />
          <FormFeedback error={state.error} />
          <SubmitButton
            pendingLabel="Saving…"
            className="w-full rounded-xl bg-niki-black px-4 py-2.5 text-sm font-semibold text-white"
          >
            Record referrer
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
