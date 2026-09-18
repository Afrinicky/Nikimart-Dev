"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, CreditCard, UserPlus, Wallet } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { ActionLink, SubmitButton } from "@/components/ui/motion";
import { registerSubAgent, type SubAgentState } from "@/lib/data-bundles/subagent-actions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Registering somebody into your team, on the spot.
 *
 * One form, filled in once: the recruit gives their details to the person
 * standing in front of them rather than to a link they have to open later and
 * fill in again. Their password is not asked for here — they choose that
 * themselves, on the link they are sent the moment this is submitted.
 *
 * The payment is a single step. Where the admin allows nothing else it is one
 * button; where they have allowed this agent's recruits to clear the fee out
 * of their commission, that appears beside it. Nothing else is on offer,
 * because what is collected is the programme's decision rather than the
 * recruiter's.
 */
export function SubAgentForm({
  payable,
  canPayFromCommission,
  canPayNow,
}: {
  /** What this agent's recruits are charged, after their waiver. */
  payable: number;
  /** The admin allows this agent's recruits to clear the fee from commission. */
  canPayFromCommission: boolean;
  /** The admin allows it to be paid up front. */
  canPayNow: boolean;
}) {
  const [state, formAction] = useActionState<SubAgentState, FormData>(registerSubAgent, {});
  const choosable = payable > 0 && canPayNow && canPayFromCommission;
  const [payWith, setPayWith] = useState<"paystack" | "commission">(
    canPayNow ? "paystack" : "commission",
  );

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
          className={cn(
            "mx-auto flex h-12 w-12 items-center justify-center rounded-2xl",
            state.payUrl
              ? "bg-niki-orange/10 text-niki-orange"
              : "bg-niki-success/10 text-niki-success",
          )}
        >
          {state.payUrl ? <CreditCard className="h-6 w-6" /> : <Check className="h-6 w-6" />}
        </span>
        <p className="mt-3 font-display text-lg font-bold text-niki-ink">
          {state.payUrl ? "Taking you to payment…" : "Registered"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/65">{state.message}</p>

        <p className="mx-auto mt-3 max-w-sm rounded-xl bg-niki-surface px-4 py-3 text-xs text-niki-ink/60">
          {state.name} has been sent a link by SMS and email to set their password. Their store
          goes live once we approve it.
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
    <form action={formAction} className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      {state.error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName">
          <input id="firstName" name="firstName" required maxLength={40} className={inputClass} />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <input id="lastName" name="lastName" required maxLength={40} className={inputClass} />
        </Field>
      </div>

      <Field label="Phone number" htmlFor="phone" hint="Their setup link is texted here.">
        <input
          id="phone"
          name="phone"
          inputMode="tel"
          required
          placeholder="0241234567"
          className={inputClass}
        />
      </Field>

      <Field label="Email" htmlFor="email" hint="They sign in with this.">
        <input id="email" name="email" type="email" required className={inputClass} />
      </Field>

      <Field label="Store name" htmlFor="storeName" hint="Their public store address.">
        <input id="storeName" name="storeName" required maxLength={60} className={inputClass} />
      </Field>

      {payable > 0 ? (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">
            Registration fee · {formatMoney(payable)}
          </span>
          <input type="hidden" name="payWith" value={payWith} />
          {choosable ? (
            <div className="grid grid-cols-2 gap-2">
              <PayTile
                selected={payWith === "paystack"}
                onSelect={() => setPayWith("paystack")}
                icon={<CreditCard className="h-3.5 w-3.5" />}
                title="Pay now"
                note="Card or mobile money"
              />
              <PayTile
                selected={payWith === "commission"}
                onSelect={() => setPayWith("commission")}
                icon={<Wallet className="h-3.5 w-3.5" />}
                title="From commission"
                note="Nothing to pay now"
              />
            </div>
          ) : (
            <p className="rounded-xl bg-niki-surface px-4 py-3 text-xs text-niki-ink/65">
              {canPayNow
                ? "Paid now by mobile money or card. Their registration is confirmed as soon as it clears."
                : "Charged to their account and cleared out of the commission they earn — nothing to pay now."}
            </p>
          )}
        </div>
      ) : null}

      <SubmitButton
        pendingLabel="Registering…"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        <UserPlus className="h-4 w-4" />
        Register agent
      </SubmitButton>
    </form>
  );
}

function PayTile({
  selected,
  onSelect,
  icon,
  title,
  note,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  note: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "niki-press niki-focus rounded-xl px-3 py-3 text-left text-sm font-bold ring-1 transition-colors",
        selected
          ? "bg-niki-orange/10 text-niki-ink ring-niki-orange"
          : "bg-white text-niki-ink/70 ring-niki-edge hover:bg-niki-black/5",
      )}
    >
      <span className="flex items-center gap-1.5">
        {icon}
        {title}
      </span>
      <span className="mt-0.5 block text-[11px] font-medium text-niki-ink/50">{note}</span>
    </button>
  );
}
