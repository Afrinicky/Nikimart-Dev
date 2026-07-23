"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";
import { confirmShipmentStage, type ConfirmState } from "@/lib/tracking-actions";

function Inner({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-1.5 rounded-full bg-niki-navy px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-niki-navy-light disabled:opacity-60"
    >
      <CheckCircle2 className="h-4 w-4 text-niki-orange" />
      {pending ? "Confirming…" : label}
    </button>
  );
}

/**
 * Confirms one shipment stage. `label` should read like an action, e.g.
 * "Confirm ready" or "Mark delivered".
 */
export function ConfirmStageButton({
  shipmentId,
  stage,
  label,
}: {
  shipmentId: string;
  stage: string;
  label: string;
}) {
  const [state, formAction] = useActionState<ConfirmState, FormData>(confirmShipmentStage, {});
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input type="hidden" name="stage" value={stage} />
      <Inner label={label} />
      {state.error ? <span className="text-[11px] font-medium text-niki-danger">{state.error}</span> : null}
    </form>
  );
}
