"use client";

import { useState } from "react";
import { Plus, Wallet, X } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { BusyButton } from "@/components/ui/motion";
import { topUpWallet } from "@/lib/data-bundles/agent-actions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Putting money into the wallet.
 *
 * The quick amounts are there because a float is a round number somebody tops
 * up on the way to work, not a sum they calculate — and the box is still there
 * for the day it isn't.
 */

const QUICK = [20, 50, 100, 200, 500];

export function TopupWalletPanel({ balance }: { balance: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="niki-press niki-focus flex items-center gap-1.5 rounded-full bg-niki-orange px-4 py-2 text-xs font-semibold text-white hover:bg-niki-orange-light"
      >
        <Plus className="h-3.5 w-3.5" />
        Top up wallet
      </button>
      {open ? <TopupDialog balance={balance} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function TopupDialog({ balance, onClose }: { balance: number; onClose: () => void }) {
  const [amount, setAmount] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await topUpWallet(value);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    if (result.authorizationUrl) {
      window.location.href = result.authorizationUrl;
      return;
    }
    // No gateway configured — the credit is already on the balance.
    window.location.href = "/agent/wallet?topup=paid";
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-niki-black/70 backdrop-blur-sm sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0"
        onClick={() => !pending && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Top up wallet"
        className="animate-sheet-up relative z-10 w-full rounded-t-3xl bg-white pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2xl sm:max-w-md sm:rounded-3xl sm:pb-0"
      >
        <div className="flex items-center justify-between gap-4 border-b border-niki-edge px-5 py-4">
          <p className="font-display text-lg font-bold text-niki-ink">Top up wallet</p>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            aria-label="Close"
            className="niki-press niki-focus rounded-full p-1.5 text-niki-ink/40 hover:bg-niki-surface hover:text-niki-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5" noValidate>
          <div className="flex items-center justify-between rounded-2xl bg-niki-surface px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-niki-ink/55">
              <Wallet className="h-4 w-4" />
              Balance now
            </span>
            <span className="font-figures text-lg font-bold text-niki-ink">
              {formatMoney(balance)}
            </span>
          </div>

          {error ? (
            <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {QUICK.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAmount(String(n))}
                className={cn(
                  "niki-press niki-focus rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors",
                  Number(amount) === n
                    ? "bg-niki-orange text-white ring-niki-orange"
                    : "bg-white text-niki-ink/65 ring-niki-edge hover:bg-niki-black/5",
                )}
              >
                GH₵{n}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink">Amount (GH₵)</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50"
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-niki-ink/50">
              Paid through Paystack — card or Mobile Money. It lands on your balance straight away.
            </span>
          </label>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="niki-press niki-focus flex-1 rounded-xl bg-niki-surface px-4 py-3 text-sm font-bold text-niki-ink/70 hover:bg-niki-black/5 disabled:opacity-60"
            >
              Cancel
            </button>
            <BusyButton
              type="submit"
              busy={pending}
              disabled={!valid}
              pendingLabel="Opening Paystack…"
              icon={<Plus className="h-4 w-4" />}
              className="flex-[1.6] whitespace-nowrap rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
            >
              Top up {valid ? formatMoney(value) : ""}
            </BusyButton>
          </div>
        </form>
      </div>
    </div>
  );
}
