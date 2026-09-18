"use client";

import { useActionState, useEffect } from "react";
import { Check, CreditCard, Send, UserPlus } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { ActionLink, SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { registerSubAgent, type SubAgentState } from "@/lib/data-bundles/subagent-actions";
import { formatMoney } from "@/lib/format";

/**
 * Registering somebody into your team, on the spot.
 *
 * Built to read like the public registration form, because it is the same
 * form — the same fields in the same order, and the fee settled the same way,
 * with one difference that matters: the recruit is not here to choose a
 * password, so one is generated and sent to them with their username once the
 * registration is settled.
 *
 * What may be chosen at the fee is not the recruiter's decision. Where the
 * admin allows only one way, that one way is stated rather than offered; where
 * both are allowed, the select appears. Either way the form posts what it was
 * given and the server checks it again.
 */
export function SubAgentForm({
  payable,
  fullFee,
  waiverPercent,
  canPayFromCommission,
  canPayNow,
}: {
  /** What this agent's recruits are charged, after their waiver. */
  payable: number;
  /** The fee at full price, for the struck-through original. */
  fullFee: number;
  waiverPercent: number;
  /** The admin allows this agent's recruits to clear the fee from commission. */
  canPayFromCommission: boolean;
  /** The admin allows it to be paid up front. */
  canPayNow: boolean;
}) {
  const [state, formAction] = useActionState<SubAgentState, FormData>(registerSubAgent, {});
  const choosable = payable > 0 && canPayNow && canPayFromCommission;
  const discounted = waiverPercent > 0 && payable < fullFee;

  // A registration that needs paying goes straight to the gateway. Anything
  // else is a checkout somebody has to remember to come back to.
  const payUrl = state.ok ? state.payUrl : undefined;
  useEffect(() => {
    if (!payUrl) return;
    const t = setTimeout(() => {
      window.location.href = payUrl;
    }, 900);
    return () => clearTimeout(t);
  }, [payUrl]);

  if (state.ok) {
    return (
      <div className="animate-scale-in rounded-2xl bg-white p-6 text-center ring-1 ring-niki-edge">
        <span
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${
            state.payUrl
              ? "bg-niki-orange/10 text-niki-orange"
              : "bg-niki-success/10 text-niki-success"
          }`}
        >
          {state.payUrl ? <CreditCard className="h-6 w-6" /> : <Check className="h-6 w-6" />}
        </span>
        <p className="mt-3 font-display text-lg font-bold text-niki-ink">
          {state.payUrl ? "Taking you to payment…" : "Registered"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/65">{state.message}</p>

        <p className="mx-auto mt-3 flex max-w-sm items-start gap-2 rounded-xl bg-niki-surface px-4 py-3 text-left text-xs text-niki-ink/60">
          <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-niki-ink/40" />
          <span>
            {state.credentialsSent
              ? `${state.name} has been texted and emailed their username and password. They'll be asked to change it when they sign in.`
              : "Once the payment clears we'll text and email them their username and password. Nothing is sent before then."}
          </span>
        </p>

        {state.payUrl ? (
          <a
            href={state.payUrl}
            className="niki-press niki-focus mx-auto mt-4 flex w-fit items-center gap-2 rounded-xl bg-niki-orange px-5 py-3 text-sm font-bold text-white"
          >
            <CreditCard className="h-4 w-4" />
            Pay {formatMoney(state.payable)} now
          </a>
        ) : (
          <ActionLink
            href="/agent/team"
            className="mt-4 block text-sm font-semibold text-niki-trust hover:underline"
          >
            Back to my team
          </ActionLink>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName">
          <input id="firstName" name="firstName" required maxLength={40} className={inputClass} />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <input id="lastName" name="lastName" required maxLength={40} className={inputClass} />
        </Field>
      </div>

      <Field label="Phone number" htmlFor="phone" hint="Their sign-in details are texted here.">
        <input
          id="phone"
          name="phone"
          inputMode="tel"
          required
          placeholder="0241234567"
          className={inputClass}
        />
      </Field>

      <Field label="Email" htmlFor="email" hint="This becomes their username.">
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className={inputClass}
        />
      </Field>

      <Field label="Store name" htmlFor="storeName" hint="This becomes their public store link.">
        <input
          id="storeName"
          name="storeName"
          required
          maxLength={60}
          placeholder="e.g. Nickland Data"
          className={inputClass}
        />
      </Field>

      {fullFee > 0 ? (
        <div className="rounded-2xl bg-niki-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-niki-ink">Registration fee</p>
            <p className="font-figures text-lg font-bold text-niki-ink">
              {discounted ? (
                <>
                  <span className="mr-2 text-sm font-medium text-niki-ink/40 line-through">
                    {formatMoney(fullFee)}
                  </span>
                  {payable > 0 ? formatMoney(payable) : "Free"}
                </>
              ) : (
                formatMoney(payable)
              )}
            </p>
          </div>

          {discounted ? (
            <p className="mt-1 text-xs font-medium text-niki-success">
              {waiverPercent >= 100 ? "Waived in full" : `${waiverPercent}% off`} — your code
            </p>
          ) : null}

          {payable <= 0 ? (
            <>
              <input type="hidden" name="payWith" value="commission" />
              <p className="mt-2 text-xs font-medium text-niki-success">Nothing to pay.</p>
            </>
          ) : choosable ? (
            <div className="mt-3">
              <Field label="How would you like to settle it?" htmlFor="payWith">
                <select
                  id="payWith"
                  name="payWith"
                  defaultValue="paystack"
                  className={inputClass}
                >
                  <option value="paystack">Pay {formatMoney(payable)} now</option>
                  <option value="commission">Take it from their commission</option>
                </select>
              </Field>
            </div>
          ) : (
            <>
              <input
                type="hidden"
                name="payWith"
                value={canPayNow ? "paystack" : "commission"}
              />
              <p className="mt-2 text-xs text-niki-ink/60">
                {canPayNow
                  ? "Payable now, on the next screen."
                  : "Taken from the commission they earn — nothing to pay now."}
              </p>
            </>
          )}
        </div>
      ) : null}

      <FormFeedback error={state.error} />

      <SubmitButton
        pendingLabel={canPayNow && payable > 0 ? "Taking you to payment…" : "Registering…"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        <UserPlus className="h-4 w-4" />
        Register agent
      </SubmitButton>

      <p className="text-center text-[11px] leading-relaxed text-niki-ink/45">
        They get their sign-in details once the registration is settled, and choose their own
        password the first time they sign in.
      </p>
    </form>
  );
}
