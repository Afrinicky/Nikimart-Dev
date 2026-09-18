"use client";

import { useActionState, useState } from "react";
import { Check, Copy, UserPlus, Wallet } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { registerSubAgent, type SubAgentState } from "@/lib/data-bundles/subagent-actions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Registering somebody into your team, on the spot.
 *
 * Five fields and one decision — who settles the fee — because an agent is
 * usually filling this in with the recruit standing next to them, on a phone.
 * The fee choice only appears when there is a fee, and the wallet option only
 * when the balance can actually cover it.
 */
export function SubAgentForm({
  payable,
  walletAvailable,
}: {
  /** What this agent's recruits are charged, after their waiver. */
  payable: number;
  walletAvailable: number;
}) {
  const [state, formAction] = useActionState<SubAgentState, FormData>(registerSubAgent, {});
  const [payWith, setPayWith] = useState<"recruit" | "wallet">("recruit");
  const [copied, setCopied] = useState(false);

  const canUseWallet = payable > 0 && walletAvailable >= payable;

  if (state.ok) {
    return (
      <div className="animate-scale-in rounded-2xl bg-white p-6 text-center ring-1 ring-niki-edge">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-success/10 text-niki-success">
          <Check className="h-6 w-6" />
        </span>
        <p className="mt-3 font-display text-lg font-bold text-niki-ink">Registered</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/65">{state.message}</p>

        {state.awaitingPayment ? (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.link);
                setCopied(true);
              } catch {
                // Clipboard blocked — the link is printed below.
              }
            }}
            className="niki-press niki-focus mx-auto mt-4 flex items-center gap-2 rounded-xl bg-niki-black px-5 py-2.5 text-sm font-semibold text-white"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Link copied" : "Copy their link"}
          </button>
        ) : null}

        <a
          href="/agent/team"
          className="mt-4 block text-sm font-semibold text-niki-trust hover:underline"
        >
          Back to my team
        </a>
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

      <Field label="Store name" htmlFor="storeName" hint="Their public store address.">
        <input id="storeName" name="storeName" required maxLength={60} className={inputClass} />
      </Field>

      {payable > 0 ? (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">
            Registration fee · {formatMoney(payable)}
          </span>
          <input type="hidden" name="payWith" value={payWith} />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPayWith("recruit")}
              aria-pressed={payWith === "recruit"}
              className={cn(
                "niki-press niki-focus rounded-xl px-3 py-3 text-left text-sm font-bold ring-1 transition-colors",
                payWith === "recruit"
                  ? "bg-niki-orange/10 text-niki-ink ring-niki-orange"
                  : "bg-white text-niki-ink/70 ring-niki-edge hover:bg-niki-black/5",
              )}
            >
              They pay
              <span className="mt-0.5 block text-[11px] font-medium text-niki-ink/50">
                Send them your link
              </span>
            </button>
            <button
              type="button"
              onClick={() => canUseWallet && setPayWith("wallet")}
              aria-pressed={payWith === "wallet"}
              disabled={!canUseWallet}
              className={cn(
                "niki-press niki-focus rounded-xl px-3 py-3 text-left text-sm font-bold ring-1 transition-colors",
                payWith === "wallet"
                  ? "bg-niki-orange/10 text-niki-ink ring-niki-orange"
                  : "bg-white text-niki-ink/70 ring-niki-edge hover:bg-niki-black/5",
                !canUseWallet && "cursor-not-allowed opacity-50 hover:bg-white",
              )}
            >
              <span className="flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" />I pay
              </span>
              <span className="mt-0.5 block text-[11px] font-medium text-niki-ink/50">
                {canUseWallet ? `${formatMoney(walletAvailable)} available` : "Not enough balance"}
              </span>
            </button>
          </div>
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
