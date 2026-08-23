"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Check } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { BusyButton } from "@/components/ui/motion";
import { Card } from "@/components/agent/AgentUi";
import { formatPrice } from "@/lib/format";
import { maxWithdrawal } from "@/lib/data-bundles/agent-pricing";
import { requestWithdrawal } from "@/lib/data-bundles/agent-actions";

const MOMO_NETWORKS = [
  { value: "MTN", label: "MTN MoMo" },
  { value: "TELECEL", label: "Telecel Cash" },
  { value: "AIRTELTIGO", label: "AT Money" },
] as const;

/**
 * Ask for commission on MoMo.
 *
 * The form is collapsed until there is something to withdraw — an always-open
 * form on a zero balance is just an invitation to be told no.
 */
export function WithdrawPanel({
  available,
  minWithdrawal,
  withdrawalFee,
  defaultPhone,
  defaultName,
}: {
  available: number;
  minWithdrawal: number;
  withdrawalFee: number;
  defaultPhone: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [momoPhone, setMomoPhone] = useState(defaultPhone);
  const [momoName, setMomoName] = useState(defaultName);
  const [momoNetwork, setMomoNetwork] = useState<(typeof MOMO_NETWORKS)[number]["value"]>("MTN");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // The fee comes out of the balance alongside the payout, so the most that can
  // actually be requested is the available amount less the fee. Same helper the
  // server validates with, so the form never offers a number it would reject.
  const maxRequest = maxWithdrawal(available, 0, withdrawalFee);
  const canWithdraw = maxRequest >= minWithdrawal;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await requestWithdrawal({
      amount: Number(amount),
      momoPhone,
      momoName,
      momoNetwork,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(result.message ?? "Withdrawal requested.");
    setAmount("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Card
      title="Withdraw commission"
      description={
        canWithdraw
          ? `Up to ${formatPrice(maxRequest)} to your MoMo${withdrawalFee > 0 ? ` (a ${formatPrice(withdrawalFee)} fee applies)` : ""}.`
          : `You need at least ${formatPrice(minWithdrawal + withdrawalFee)} available to withdraw.`
      }
      icon={Banknote}
      action={
        canWithdraw && !open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="niki-press niki-focus rounded-full bg-niki-orange px-4 py-2 text-xs font-bold text-white hover:bg-niki-orange-light"
          >
            Withdraw
          </button>
        ) : null
      }
    >
      {done ? (
        <p className="animate-fade-up flex items-center gap-2 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
          <Check className="h-4 w-4" />
          {done}
        </p>
      ) : null}

      {!canWithdraw ? (
        <p className="text-sm text-niki-ink/55">
          Commission is credited as each order is delivered. Once your balance clears{" "}
          {formatPrice(minWithdrawal + withdrawalFee)}, the withdraw button appears here.
        </p>
      ) : open ? (
        <form onSubmit={submit} className="animate-fade-up space-y-4" noValidate>
          {error ? (
            <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
              {error}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-niki-ink">
                Amount (GH₵) <span className="text-niki-danger">*</span>
              </span>
              <input
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={maxRequest.toFixed(2)}
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-niki-ink/50">
                Max {formatPrice(maxRequest)}
                {withdrawalFee > 0 ? ` · ${formatPrice(withdrawalFee)} fee deducted on top` : ""}
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-niki-ink">
                MoMo network <span className="text-niki-danger">*</span>
              </span>
              <select
                value={momoNetwork}
                onChange={(e) => setMomoNetwork(e.target.value as typeof momoNetwork)}
                className={inputClass}
              >
                {MOMO_NETWORKS.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-niki-ink">
                MoMo number <span className="text-niki-danger">*</span>
              </span>
              <input
                inputMode="tel"
                required
                value={momoPhone}
                onChange={(e) => setMomoPhone(e.target.value)}
                placeholder="0241234567"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-niki-ink">
                Name on the account <span className="text-niki-danger">*</span>
              </span>
              <input
                required
                value={momoName}
                onChange={(e) => setMomoName(e.target.value)}
                placeholder="As registered on MoMo"
                className={inputClass}
              />
            </label>
          </div>

          <p className="text-xs text-niki-ink/50">
            Payouts are sent by hand, usually the same day. The amount leaves your balance now so it
            can&apos;t be spent twice, and comes straight back if the request is rejected.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="niki-press niki-focus rounded-xl bg-niki-surface px-5 py-3 text-sm font-bold text-niki-ink/70 hover:bg-niki-navy/5 disabled:opacity-60"
            >
              Cancel
            </button>
            <BusyButton
              type="submit"
              busy={pending}
              pendingLabel="Sending request…"
              icon={<Banknote className="h-4 w-4" />}
              className="flex-1 rounded-xl bg-niki-orange px-5 py-3 text-sm font-bold text-white hover:bg-niki-orange-light sm:flex-none"
            >
              Request withdrawal
            </BusyButton>
          </div>
        </form>
      ) : (
        <p className="text-sm text-niki-ink/55">
          {formatPrice(maxRequest)} is ready to go to your MoMo.
        </p>
      )}
    </Card>
  );
}
