"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { CopyChip } from "@/components/agent/AgentCode";
import { cn } from "@/lib/cn";
import { SubmitButton } from "@/components/ui/motion";
import {
  approveApplication,
  rejectApplication,
  type ApplyState,
} from "@/lib/data-bundles/agent-application-actions";

/**
 * Approve or reject one application.
 *
 * Approving provisions a real account and charges a setup fee, so it is a
 * single deliberate button. Rejecting opens a reason box first — the applicant
 * is texted whatever is written there, and "no" with no explanation is the
 * thing that generates a support call.
 */
export function ApplicationReview({ id }: { id: string }) {
  const [approveState, approve] = useActionState<ApplyState, FormData>(approveApplication, {});
  const [rejectState, reject] = useActionState<ApplyState, FormData>(rejectApplication, {});
  const [rejecting, setRejecting] = useState(false);

  const state = approveState.error || approveState.ok ? approveState : rejectState;

  if (state.ok) {
    return (
      <div className="animate-fade-up space-y-3">
        <p
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium",
            state.delivered === false
              ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
              : "bg-niki-success/10 text-niki-success",
          )}
        >
          <Check className="h-4 w-4 shrink-0" />
          {state.message}
        </p>

        {/* The link, always — not only when sending failed. A text can be sent
            and still not arrive, and this is the only way to set a password. */}
        {state.setupUrl ? (
          <div className="rounded-xl bg-niki-surface p-3 ring-1 ring-niki-edge-strong">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/50">
              One-time setup link · valid 7 days
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-niki-ink/75 ring-1 ring-niki-edge">
                {state.setupUrl}
              </code>
              <CopyChip value={state.setupUrl} className="bg-white text-niki-ink/70 ring-1 ring-niki-edge-strong" />
            </div>
            <p className="mt-2 text-xs text-niki-ink/55">
              Send this to them on WhatsApp if the text doesn&apos;t arrive. They choose a password
              on it, and the link stops working once they have.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state.error ? (
        <p
          role="alert"
          className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger"
        >
          {state.error}
        </p>
      ) : null}

      {rejecting ? (
        <form action={reject} className="animate-fade-up space-y-3">
          <input type="hidden" name="id" value={id} />
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-niki-ink/60">
              Reason (texted to the applicant)
            </span>
            <input
              name="adminNote"
              placeholder="e.g. We're not taking agents in that area yet."
              className={inputClass}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="niki-press niki-focus rounded-full bg-niki-surface px-4 py-2 text-xs font-bold text-niki-ink/65"
            >
              Cancel
            </button>
            <SubmitButton
              pendingLabel="Rejecting…"
              className="rounded-full bg-niki-danger px-4 py-2 text-xs font-bold text-white"
            >
              Confirm rejection
            </SubmitButton>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <form action={approve}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton
              pendingLabel="Approving…"
              icon={<Check className="h-3.5 w-3.5" />}
              className="rounded-full bg-niki-success px-4 py-2 text-xs font-bold text-white"
            >
              Approve &amp; send setup link
            </SubmitButton>
          </form>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="niki-press niki-focus flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-niki-danger ring-1 ring-niki-danger/30"
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
