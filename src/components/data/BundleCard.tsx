"use client";

import { ArrowRight, Infinity as InfinityIcon } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { NETWORK_INFO, bundleLabel, type Network } from "@/lib/data-bundles/networks";

/**
 * One bundle, as a card.
 *
 * The network's own colour carries the card rather than trimming it: a full
 * band across the top and another across the action bar, with the numbers on
 * white in between. At a glance you read the operator from the colour, then the
 * two things that actually matter — how much data, and what it costs — side by
 * side in equal weight.
 *
 * Same component everywhere it appears, so a card on a phone, on the desktop
 * grid, and in the agent's own topup screen are recognisably the same object.
 */
export function BundleCard({
  network,
  sizeGb,
  price,
  validity,
  /** The secondary column's heading. "Cost" on a storefront, "Your cost" for an agent. */
  costLabel = "Cost",
  /** An extra line under the action bar, e.g. an agent's margin on the sale. */
  footnote,
  actionLabel = "Buy now",
  onSelect,
}: {
  network: Network;
  sizeGb: number;
  price: number;
  validity?: string;
  costLabel?: string;
  footnote?: string;
  actionLabel?: string;
  onSelect: () => void;
}) {
  const info = NETWORK_INFO[network];
  const band = `linear-gradient(135deg, ${info.accentFrom}, ${info.accentTo})`;
  // The badge and action text sit on the band, so they take the colour the
  // network declares as readable against it.
  const onBand = info.onAccent;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group niki-press niki-lift niki-focus flex w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-black/5 hover:shadow-xl"
    >
      {/* Colour band — the network's identity, and most of the card's weight. */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3.5"
        style={{ background: band }}
      >
        <span className="font-display text-sm font-bold" style={{ color: onBand }}>
          {info.short} Data
        </span>
        <span
          className="flex items-center gap-1 rounded-md bg-niki-ink/85 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
          title={validity}
        >
          <InfinityIcon className="h-3 w-3" />
          Non-expiry
        </span>
      </div>

      {/* The two numbers, given equal room and a rule between them. */}
      <div className="grid flex-1 grid-cols-2 divide-x divide-black/10">
        <div className="px-4 py-3.5">
          <p className="text-[11px] font-medium text-niki-ink/45">Data</p>
          <p className="mt-0.5 font-display text-lg font-bold text-niki-ink sm:text-xl">
            {bundleLabel(sizeGb)}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-[11px] font-medium text-niki-ink/45">{costLabel}</p>
          <p className="mt-0.5 font-display text-lg font-bold text-niki-ink sm:text-xl">
            {formatMoney(price)}
          </p>
        </div>
      </div>

      {footnote ? (
        <p className="border-t border-black/5 px-4 py-2 text-[11px] font-semibold text-niki-success">
          {footnote}
        </p>
      ) : null}

      {/* Action bar, in the same colour as the header so the card reads as one
          coloured object rather than a white card with a stripe. */}
      <div
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold"
        style={{ background: band, color: onBand }}
      >
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

/**
 * The network chooser above the grid. Selected tabs fill with the network's
 * gradient; the rest stay outlined in it, so the whole row reads as a set of
 * operators rather than a set of buttons.
 */
export function NetworkTabs({
  networks,
  value,
  onChange,
}: {
  networks: Network[];
  value: Network;
  onChange: (n: Network) => void;
}) {
  return (
    // Two per row on a phone; from `sm` they share one row evenly however many
    // there are, so three networks don't leave a hole where a fourth would be.
    <div className="grid grid-cols-2 gap-2.5 sm:flex sm:gap-3">
      {networks.map((n) => {
        const info = NETWORK_INFO[n];
        const active = n === value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={active}
            className={cn(
              "niki-press niki-focus flex items-center justify-center gap-2 rounded-2xl px-3 py-3.5 text-sm font-bold sm:flex-1",
              active ? "shadow-lg" : "bg-white",
            )}
            style={
              active
                ? {
                    background: `linear-gradient(135deg, ${info.accentFrom}, ${info.accentTo})`,
                    color: info.onAccent,
                  }
                : {
                    color: info.accentTo,
                    boxShadow: `inset 0 0 0 2px ${info.accentFrom}`,
                  }
            }
          >
            {info.label}
          </button>
        );
      })}
    </div>
  );
}
