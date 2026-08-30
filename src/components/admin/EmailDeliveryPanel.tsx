"use client";

import { useActionState } from "react";
import { AlertTriangle, Check, CircleSlash, Mail, ShieldCheck, X } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { sendTestEmail, type TestEmailState } from "@/lib/notification-actions";
import type { EmailReadiness } from "@/lib/email-sender";

const TONE = {
  ready: {
    icon: ShieldCheck,
    label: "Live",
    ring: "ring-niki-success/30",
    chip: "bg-niki-success/10 text-niki-success",
  },
  sandbox: {
    icon: AlertTriangle,
    label: "Test mode",
    ring: "ring-niki-orange/40",
    chip: "bg-niki-orange/10 text-niki-orange",
  },
  invalid: {
    icon: X,
    label: "Misconfigured",
    ring: "ring-niki-danger/30",
    chip: "bg-niki-danger/10 text-niki-danger",
  },
  off: {
    icon: CircleSlash,
    label: "Off",
    ring: "ring-niki-edge",
    chip: "bg-niki-ink/5 text-niki-ink/60",
  },
} as const satisfies Record<EmailReadiness, unknown>;

/**
 * Whether customers actually receive email, and a way to prove it.
 *
 * Email is deliberately best-effort everywhere else in the app — a failed
 * receipt must never break a checkout — which means the only evidence of a
 * broken configuration is a log line. This is where that becomes visible, and
 * it distinguishes the two states that look identical from outside: sending,
 * and sending to anyone other than yourself.
 */
export function EmailDeliveryPanel({
  readiness,
  detail,
  from,
  defaultTo,
}: {
  readiness: EmailReadiness;
  detail: string;
  from: string;
  defaultTo: string;
}) {
  const [state, run, pending] = useActionState<TestEmailState, FormData>(
    async (_prev, fd) => sendTestEmail(fd),
    {},
  );
  const tone = TONE[readiness];
  const Icon = tone.icon;

  return (
    <section className={`rounded-2xl bg-white p-6 ring-1 ${tone.ring}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-ink/5 text-niki-ink">
          <Mail className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-niki-ink">Email delivery</h2>
          <p className="text-sm text-niki-ink/60">Order confirmations, delivery updates, reset codes.</p>
        </div>
        <span
          className={`ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tone.chip}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {tone.label}
        </span>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-niki-ink/70">{detail}</p>

      {readiness !== "off" ? (
        <p className="mt-2 font-mono text-xs break-all text-niki-ink/40">from: {from}</p>
      ) : null}

      {/* No point offering a test send when nothing would be attempted. */}
      {readiness === "off" ? null : (
        <form action={run} className="mt-5 border-t border-niki-edge pt-5">
          <label htmlFor="test-email-to" className="block text-sm font-medium text-niki-ink">
            Send a test email
          </label>
          <p className="mt-1 text-xs text-niki-ink/50">
            Sends one real email and shows exactly what Resend said back.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="test-email-to"
              name="to"
              type="email"
              defaultValue={defaultTo}
              placeholder="you@example.com"
              className={`${inputClass} min-w-0 flex-1`}
            />
            <SubmitButton className="shrink-0 rounded-xl bg-niki-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-ink/85">
              Send test
            </SubmitButton>
          </div>

          {!pending && state.error ? (
            <p
              role="alert"
              className="animate-fade-up mt-3 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium break-words text-niki-danger"
            >
              {state.error}
            </p>
          ) : null}
          {!pending && state.ok ? (
            <p
              role="alert"
              className="animate-fade-up mt-3 flex items-start gap-2 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{state.message}</span>
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
