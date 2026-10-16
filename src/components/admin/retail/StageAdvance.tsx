"use client";

import { useActionState } from "react";
import { ArrowRight, Check, Loader2, ShieldAlert } from "lucide-react";
import { useFormStatus } from "react-dom";
import { confirmShipmentStage, type ConfirmState } from "@/lib/tracking-actions";
import { cn } from "@/lib/cn";

/**
 * The next thing to do to this order, as one button.
 *
 * An admin reading an order should not have to work out whose turn it is — and
 * before this, the only way to move a consignment on from the console was the
 * status dropdown, which wrote a status and left the timeline the buyer reads
 * untouched. This confirms the stage properly: the timestamp is stamped, the
 * earlier stages are back-filled, the order's own status is re-derived from
 * them, and the buyer is told.
 *
 * It is the same server action the seller, the freight agent and the pickup
 * operator press on their own screens. An admin may confirm any stage, which
 * is the override — the point being that the override goes through the same
 * door as everything else rather than round the back of it.
 */
export function StageAdvance({
  shipmentId,
  stage,
  label,
  detail,
}: {
  shipmentId: string;
  stage: string;
  label: string;
  detail: string;
}) {
  const [state, formAction] = useActionState<ConfirmState, FormData>(confirmShipmentStage, {});

  return (
    <form action={formAction} className="rounded-2xl bg-niki-orange/[0.07] p-5 ring-1 ring-niki-orange/25">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input type="hidden" name="stage" value={stage} />

      <p className="text-xs font-semibold uppercase tracking-wide text-niki-orange">Next action</p>
      <p className="mt-1 text-sm text-niki-ink/75">{detail}</p>

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
          Confirmed — the buyer has been told.
        </p>
      ) : null}

      <Submit label={label} />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "niki-press niki-focus mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 sm:w-auto",
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
      {pending ? "Confirming…" : label}
    </button>
  );
}
