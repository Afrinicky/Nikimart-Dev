"use client";

import { useActionState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { MedicalSubmit } from "@/components/medical/ui/MedicalButton";

/**
 * A form wired to a server action, with its own result shown in place.
 *
 * Every mutating screen in this console uses it, so a failure always appears
 * in the same spot and always reads as a sentence. The alternative — throwing
 * out of the action — gives the user Next's error boundary, which says nothing
 * about which field was wrong and loses everything they typed.
 *
 * `useActionState` keeps the result across the transition, so the message
 * survives the re-render the action triggers.
 */

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  successMessage,
  variant = "primary",
  className,
  children,
  footer,
}: {
  action: (form: FormData) => Promise<ActionResult>;
  submitLabel: string;
  pendingLabel?: string;
  successMessage?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  children?: React.ReactNode;
  /** Extra controls beside the submit button. */
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    async (_previous, form) => action(form),
    null,
  );

  return (
    <form action={formAction} className={className}>
      {children}

      {state && !state.ok ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl bg-medi-danger-soft px-3.5 py-3 text-[0.8125rem] text-medi-danger"
        >
          <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </p>
      ) : null}

      {state?.ok && successMessage ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-xl bg-medi-success-soft px-3.5 py-3 text-[0.8125rem] text-medi-success"
        >
          <Check className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>{state.message ?? successMessage}</span>
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <MedicalSubmit
          variant={variant === "danger" ? "primary" : variant}
          pendingLabel={pendingLabel ?? "Saving…"}
          className={variant === "danger" ? "!bg-medi-danger text-white hover:opacity-90" : undefined}
        >
          {submitLabel}
        </MedicalSubmit>
        {footer}
      </div>
    </form>
  );
}
