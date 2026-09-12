"use client";

import { useState, useTransition } from "react";
import { Banknote, Check, Gift, Loader2, Signal } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { redeemReward } from "@/lib/data-bundles/leaderboard-actions";
import { cn } from "@/lib/cn";

/**
 * Spending points.
 *
 * The shelf is whatever the admin has put on it, so nothing here assumes a
 * price, a tier or a kind of reward. Each card says exactly one thing: what
 * you get, what it costs, and whether you can have it yet — and a reward out
 * of reach says how far off it is rather than going quiet.
 *
 * A data reward needs somewhere to send the bundle, so the number is asked
 * for on the card itself when it is claimed. Nobody should have to remember
 * to tell support afterwards.
 */

export interface RewardTierView {
  id: string;
  label: string;
  kind: string;
  points: number;
  cashAmount: number;
  network: string;
  sizeGb: number;
  /** Pre-rendered on the server so the money and bundle names read the same. */
  detail: string;
}

export function RewardsPanel({
  balance,
  tiers,
  open,
}: {
  balance: number;
  tiers: RewardTierView[];
  /** False when the admin has closed the shelf — the boards keep running. */
  open: boolean;
}) {
  const [claiming, setClaiming] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function claim(tier: RewardTierView) {
    // A data reward needs a number before it can go anywhere. Asking on the
    // card keeps the whole thing to one tap for cash and two for data.
    if (tier.kind === "BUNDLE" && claiming !== tier.id) {
      setClaiming(tier.id);
      setError(null);
      setDone(null);
      return;
    }

    setError(null);
    start(async () => {
      const result = await redeemReward({ tierId: tier.id, recipientPhone: phone });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(result.message);
      setClaiming(null);
      setPhone("");
    });
  }

  if (tiers.length === 0) {
    return (
      <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
        No rewards on the shelf yet. Keep selling — your points are safe and they carry over.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {done ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/25"
        >
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          {done}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {tiers.map((tier) => {
          const short = tier.points - balance;
          const affordable = short <= 0;
          const Icon = tier.kind === "CASH" ? Banknote : Signal;
          return (
            <li
              key={tier.id}
              className={cn(
                "flex flex-col rounded-2xl p-4 ring-1",
                affordable && open
                  ? "bg-white ring-niki-orange/35"
                  : "bg-white/70 ring-niki-edge",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    affordable ? "bg-niki-orange/10 text-niki-orange" : "bg-niki-surface text-niki-ink/40",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-bold text-niki-ink">{tier.label}</p>
                  <p className="text-xs text-niki-ink/55">{tier.detail}</p>
                </div>
                <span className="shrink-0 rounded-full bg-niki-surface px-2.5 py-1 font-figures text-xs font-bold text-niki-ink/75">
                  {tier.points.toLocaleString("en-GH")} pts
                </span>
              </div>

              {claiming === tier.id ? (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-medium text-niki-ink/70">
                    Number to credit
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    maxLength={15}
                    placeholder="0241234567"
                    className={inputClass}
                  />
                </label>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-2">
                {affordable ? (
                  <span className="text-xs font-semibold text-niki-success">Ready to claim</span>
                ) : (
                  <span className="text-xs text-niki-ink/50">
                    {short.toLocaleString("en-GH")} points to go
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => claim(tier)}
                  disabled={!open || !affordable || pending}
                  aria-busy={pending || undefined}
                  className="niki-press niki-focus flex items-center gap-1.5 rounded-full bg-niki-black px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending && claiming === tier.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Gift className="h-3.5 w-3.5" />
                  )}
                  {claiming === tier.id ? "Confirm" : "Claim"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {!open ? (
        <p className="rounded-xl bg-niki-surface px-4 py-3 text-xs text-niki-ink/60">
          Redeeming is paused at the moment. Your points keep adding up.
        </p>
      ) : null}
    </div>
  );
}
