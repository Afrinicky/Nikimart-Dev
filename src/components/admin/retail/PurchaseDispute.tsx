"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Check, Loader2, ShieldAlert } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { DISPUTE_STATUSES } from "@/lib/retail/purchase-fields";
import { setPurchaseDispute, type PurchaseState } from "@/lib/retail/purchase-actions";
import { cn } from "@/lib/cn";

/**
 * When a purchase goes wrong.
 *
 * The state that matters is whether money is still out there: "raised" is a
 * live claim somebody is chasing, and "refunded" and "written off" are both
 * endings — one recovers the money, the other admits it is gone. Keeping them
 * apart is what lets the console say how much the business has actually lost
 * to suppliers rather than how much it has argued about.
 */
export function PurchaseDispute({
  id,
  status,
  note,
  raisedAt,
}: {
  id: string;
  status: string;
  note: string;
  raisedAt: string;
}) {
  const [state, formAction] = useActionState<PurchaseState, FormData>(setPurchaseDispute, {});
  const live = status === "raised";

  return (
    <form
      action={formAction}
      className={cn(
        "rounded-2xl p-5 ring-1",
        live
          ? "bg-niki-danger/[0.06] ring-niki-danger/25"
          : status === "written_off"
            ? "bg-niki-ink/[0.04] ring-niki-edge"
            : "bg-white ring-niki-edge",
      )}
    >
      <input type="hidden" name="id" value={id} />

      <div className="flex items-center gap-2 text-niki-ink">
        <AlertTriangle className={cn("h-4 w-4", live ? "text-niki-danger" : "text-niki-ink/40")} />
        <h2 className="font-display text-sm font-bold">Problem with this purchase</h2>
      </div>
      <p className="mt-1 text-xs text-niki-ink/55">
        {raisedAt && status !== "none" ? `Last changed ${raisedAt}. ` : ""}
        Flag it the moment the goods are late or missing — the payments above are the claim.
      </p>

      {state.error ? (
        <p
          role="alert"
          className="animate-fade-up mt-3 flex items-start gap-2 rounded-xl bg-niki-danger/10 px-3 py-2.5 text-sm font-medium text-niki-danger"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="animate-fade-up mt-3 flex items-center gap-2 rounded-xl bg-niki-success/10 px-3 py-2.5 text-sm font-medium text-niki-success">
          <Check className="h-4 w-4" />
          {state.message}
        </p>
      ) : null}

      <label className="mt-3 block">
        <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">State</span>
        <select
          name="disputeStatus"
          defaultValue={status}
          className={cn(inputClass, "py-2 text-sm")}
        >
          {DISPUTE_STATUSES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">What happened</span>
        <textarea
          name="disputeNote"
          rows={3}
          defaultValue={note}
          placeholder="What was promised, what arrived, what has been asked for and when"
          className={cn(inputClass, "py-2 text-sm")}
        />
      </label>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="niki-press niki-focus mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-niki-black px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Saving…" : "Save"}
    </button>
  );
}
