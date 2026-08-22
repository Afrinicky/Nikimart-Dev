"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Save } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { BusyButton } from "@/components/ui/motion";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import { setAgentAfaPrice } from "@/lib/data-bundles/agent-actions";

/**
 * AFA Pricing: the agent's own registration price on top of NikiMart's, and
 * whether AFA shows on their storefront at all.
 */
export function AfaPricingForm({
  basePrice,
  initialPrice,
  initialAvailable,
}: {
  basePrice: number;
  initialPrice: number;
  initialAvailable: boolean;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(String(initialPrice > 0 ? initialPrice : basePrice));
  const [available, setAvailable] = useState(initialAvailable);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const parsed = Number(price);
  const commission = Number.isFinite(parsed) ? Math.max(0, parsed - basePrice) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await setAgentAfaPrice({ price: Number(price), available });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(result.message ?? "Saved.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <p className="rounded-xl bg-niki-gold/10 px-4 py-3 text-sm text-niki-ink/70 ring-1 ring-niki-gold/40">
        <span className="font-semibold text-niki-ink">About AFA pricing.</span> Set what you charge
        for an AFA registration. It has to be at least NikiMart&apos;s price — whatever you add on
        top is your commission.
      </p>

      {error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="animate-fade-up flex items-center gap-2 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
          <Check className="h-4 w-4" />
          {saved}
        </p>
      ) : null}

      <div className="rounded-2xl bg-niki-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
          NikiMart&apos;s price
        </p>
        <p className="mt-1 font-display text-2xl font-bold text-niki-ink">
          {formatPrice(basePrice)}
        </p>
      </div>

      <label className="block max-w-sm">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">Your AFA price (GH₵)</span>
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
            setSaved(null);
          }}
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-niki-ink/50">
          Your commission:{" "}
          <span className={cn("font-semibold", commission > 0 ? "text-niki-success" : "text-niki-ink/50")}>
            {formatPrice(commission)}
          </span>
        </span>
      </label>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">Availability</span>
        <button
          type="button"
          onClick={() => {
            setAvailable((a) => !a);
            setSaved(null);
          }}
          role="switch"
          aria-checked={available}
          className="niki-press niki-focus flex items-center gap-3"
        >
          <span
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              available ? "bg-niki-success" : "bg-niki-ink/20",
            )}
          >
            <span
              className={cn(
                "inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform",
                available ? "translate-x-6" : "translate-x-1",
              )}
            />
          </span>
          <span className="text-sm font-semibold text-niki-ink">
            {available ? "Available" : "Unavailable"}
          </span>
        </button>
        <p className="mt-1 text-xs text-niki-ink/50">
          When unavailable, customers won&apos;t see AFA registration on your storefront.
        </p>
      </div>

      <BusyButton
        type="submit"
        busy={pending}
        pendingLabel="Saving…"
        icon={<Save className="h-4 w-4" />}
        className="rounded-xl bg-niki-orange px-6 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        Save AFA pricing
      </BusyButton>
    </form>
  );
}
