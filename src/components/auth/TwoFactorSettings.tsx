"use client";

import { useActionState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  startTwoFactorSetup,
  type TwoFactorState,
} from "@/lib/two-factor-actions";
import { cn } from "@/lib/cn";

/**
 * Two-step verification, on the account it protects.
 *
 * Off is the honest default here, so the card leads with what it would cost
 * you rather than with a warning: this is one extra code at sign-in, not a
 * security posture to feel bad about declining.
 */
export function TwoFactorSettings({
  enabled,
  channel,
  hasPhone,
}: {
  enabled: boolean;
  channel: string;
  /** Text messages are only offered to an account we have a number for. */
  hasPhone: boolean;
}) {
  const [setup, startAction] = useActionState<TwoFactorState, FormData>(startTwoFactorSetup, {});
  const [confirm, confirmAction] = useActionState<TwoFactorState, FormData>(
    confirmTwoFactorSetup,
    {},
  );
  const pending = confirm.pending ?? setup.pending;
  const isOn = confirm.ok ? true : enabled;

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              isOn ? "bg-niki-success/10 text-niki-success" : "bg-niki-surface text-niki-ink/40",
            )}
          >
            {isOn ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
          </span>
          <div>
            <h2 className="font-display font-bold text-niki-ink">Two-step verification</h2>
            <p className="mt-0.5 text-sm text-niki-ink/60">
              {isOn
                ? `On — a code is sent by ${channel === "sms" ? "text message" : "email"} each time you sign in.`
                : "Off — your password alone signs you in."}
            </p>
          </div>
        </div>

        {isOn ? (
          <form action={disableTwoFactor}>
            <SubmitButton
              pendingLabel="Turning off…"
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-niki-danger ring-1 ring-niki-danger/30 hover:bg-niki-danger/5"
            >
              Turn off
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {isOn && confirm.ok ? <FormFeedback success={confirm.message} className="mt-4" /> : null}

      {!isOn && !pending ? (
        <form action={startAction} className="mt-4 space-y-3">
          <label htmlFor="twoFactorChannel" className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink">Send my code by</span>
            <select
              id="twoFactorChannel"
              name="channel"
              defaultValue={channel === "sms" && hasPhone ? "sms" : "email"}
              className={inputClass}
            >
              <option value="email">Email</option>
              <option value="sms" disabled={!hasPhone}>
                Text message{hasPhone ? "" : " — add a phone number first"}
              </option>
            </select>
          </label>
          <FormFeedback error={setup.error} />
          <SubmitButton
            pendingLabel="Sending code…"
            className="rounded-xl bg-niki-black px-5 py-2.5 text-sm font-bold text-white"
          >
            Turn on
          </SubmitButton>
        </form>
      ) : null}

      {!isOn && pending ? (
        <form action={confirmAction} className="animate-fade-up mt-4 space-y-3">
          <input type="hidden" name="challengeId" value={pending.challengeId} />
          <input type="hidden" name="channel" value={pending.channel} />
          <input type="hidden" name="hint" value={pending.hint} />
          <label htmlFor="twoFactorCode" className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink">
              Enter the code sent to {pending.hint}
            </span>
            <input
              id="twoFactorCode"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              placeholder="000000"
              className={cn(inputClass, "text-center font-figures text-lg font-bold tracking-[0.4em]")}
            />
          </label>
          <FormFeedback error={confirm.error} />
          <SubmitButton
            pendingLabel="Checking…"
            className="rounded-xl bg-niki-black px-5 py-2.5 text-sm font-bold text-white"
          >
            Confirm and turn on
          </SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
