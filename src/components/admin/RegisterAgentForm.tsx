"use client";

import { useActionState, useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { ActionLink, SubmitButton } from "@/components/ui/motion";
import { adminRegisterAgent, type AdminAgentState } from "@/lib/data-bundles/admin-agent-actions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Putting an agent on the platform from the console.
 *
 * The discount is the only judgement call, so it gets the quick buttons and
 * says what each end means — full price, or free. Everything else is the same
 * five fields the signup form asks for.
 */

const QUICK = [0, 50, 100];

export function RegisterAgentForm({ setupFee }: { setupFee: number }) {
  const [state, formAction] = useActionState<AdminAgentState, FormData>(adminRegisterAgent, {});
  const [waiver, setWaiver] = useState("100");
  const [copied, setCopied] = useState(false);

  const percent = Math.min(100, Math.max(0, Number(waiver) || 0));
  const payable = Math.round(setupFee * (1 - percent / 100) * 100) / 100;

  if (state.ok) {
    return (
      <div className="animate-scale-in rounded-2xl bg-white p-6 text-center ring-1 ring-niki-edge">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-success/10 text-niki-success">
          <Check className="h-6 w-6" />
        </span>
        <p className="mt-3 font-display text-lg font-bold text-niki-ink">
          {state.storeName} is registered
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/65">{state.message}</p>

        {state.setupUrl ? (
          <>
            <p className="mt-4 text-xs font-medium text-niki-ink/50">
              Send them this link to set their password. It lasts 7 days.
            </p>
            <p className="mt-1.5 break-all rounded-xl bg-niki-surface px-4 py-3 font-mono text-[11px] text-niki-ink/70">
              {state.setupUrl}
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.setupUrl ?? "");
                  setCopied(true);
                } catch {
                  // Clipboard blocked — the link is printed above.
                }
              }}
              className="niki-press niki-focus mx-auto mt-3 flex items-center gap-2 rounded-xl bg-niki-black px-5 py-2.5 text-sm font-semibold text-white"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Link copied" : "Copy setup link"}
            </button>
          </>
        ) : null}

        <ActionLink
          href="/admin/data/agents"
          className="mt-4 block text-sm font-semibold text-niki-trust hover:underline"
        >
          Back to agents
        </ActionLink>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone number" htmlFor="phone">
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
      </div>

      <Field label="Store name" htmlFor="storeName" hint="Their public store address.">
        <input id="storeName" name="storeName" required maxLength={60} className={inputClass} />
      </Field>

      {setupFee > 0 ? (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">
            Registration fee ·{" "}
            <span className="font-bold">{payable > 0 ? formatMoney(payable) : "Free"}</span>
          </span>
          <div className="mb-2 flex flex-wrap gap-2">
            {QUICK.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setWaiver(String(n))}
                className={cn(
                  "niki-press niki-focus rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
                  percent === n
                    ? "bg-niki-orange text-white ring-niki-orange"
                    : "bg-white text-niki-ink/65 ring-niki-edge hover:bg-niki-black/5",
                )}
              >
                {n === 0 ? "Full price" : n === 100 ? "Waived" : `${n}% off`}
              </button>
            ))}
          </div>
          <input
            id="waiverPercent"
            name="waiverPercent"
            type="number"
            min={0}
            max={100}
            step="1"
            required
            value={waiver}
            onChange={(e) => setWaiver(e.target.value)}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-niki-ink/50">
            Percent off {formatMoney(setupFee)}. Anything left clears from their commission.
          </span>
        </div>
      ) : null}

      <Field
        label="Recruited by"
        htmlFor="referralCode"
        hint="Optional. Their agent code, if somebody brought them in."
      >
        <input
          id="referralCode"
          name="referralCode"
          maxLength={20}
          placeholder="NKM4821"
          autoCapitalize="characters"
          className={`${inputClass} font-mono uppercase`}
        />
      </Field>

      <SubmitButton
        pendingLabel="Registering…"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-niki-black px-4 py-3 text-sm font-bold text-white hover:bg-niki-black-mute"
      >
        <UserPlus className="h-4 w-4" />
        Register and open store
      </SubmitButton>
    </form>
  );
}
