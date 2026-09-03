"use client";

import { Clock, Plane, Route as RouteIcon, Ship, Truck } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { describeTransit } from "@/lib/shipping";
import type { RouteGroup } from "@/lib/cart-pricing";

const MODE_ICONS: Record<string, typeof Plane> = {
  air: Plane,
  sea: Ship,
  road: Truck,
  express: Plane,
};

/**
 * How the buyer's goods travel from abroad, and what that costs.
 *
 * A forwarder who sells a sea lane and an air lane is selling two different
 * products: 35–45 days at one price, 7–14 at another. Choosing between them is
 * the buyer's decision to make and nobody else's — a seller picking for them
 * either overcharges somebody who was happy to wait or keeps somebody waiting
 * who would gladly have paid.
 *
 * Every figure here is the whole cart's shipping total on that lane, computed
 * on the server, so the comparison is the one the buyer is actually making
 * rather than a per-item delta they would have to add up themselves. It only
 * appears when there is genuinely more than one lane: a picker with one option
 * asks somebody to make a decision that has already been made.
 */
export function RouteChoice({
  groups,
  chosen,
  onChoose,
  disabled = false,
}: {
  groups: RouteGroup[];
  /** forwarder id → route id. */
  chosen: Record<string, string>;
  onChoose: (forwarderId: string, routeId: string) => void;
  disabled?: boolean;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2">
        <RouteIcon className="h-5 w-5 text-niki-orange" />
        <h2 className="font-display text-lg font-bold text-niki-ink">How should it travel?</h2>
      </div>
      <p className="mt-1 text-sm text-niki-ink/60">
        Your imported items can come by more than one route. Faster costs more; the slower one is
        the same goods, later. Pick whichever suits you.
      </p>

      <div className="mt-4 space-y-5">
        {groups.map((group) => {
          const selected = chosen[group.forwarderId] ?? group.selectedRouteId;
          const cheapest = Math.min(...group.options.filter((o) => !o.unpriced).map((o) => o.fee));
          return (
            <div key={group.forwarderId}>
              <p className="text-sm font-semibold text-niki-ink">
                {group.itemNames.slice(0, 2).join(", ")}
                {group.itemNames.length > 2 ? ` and ${group.itemNames.length - 2} more` : ""}
              </p>
              <p className="text-xs text-niki-ink/50">Carried by {group.forwarderName}</p>

              <div className="mt-2 space-y-2">
                {group.options.map((option) => {
                  const Icon = MODE_ICONS[option.mode] ?? Truck;
                  const active = option.routeId === selected;
                  return (
                    <label
                      key={option.routeId}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4 transition-colors ${
                        active
                          ? "border-niki-orange bg-niki-orange/5"
                          : "border-niki-edge-strong hover:bg-niki-surface"
                      } ${option.unpriced ? "opacity-50" : ""}`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <input
                          type="radio"
                          name={`route-${group.forwarderId}`}
                          value={option.routeId}
                          checked={active}
                          disabled={disabled || option.unpriced}
                          onChange={() => onChoose(group.forwarderId, option.routeId)}
                          className="h-4 w-4 shrink-0 text-niki-orange focus:ring-niki-orange"
                        />
                        <Icon className="h-4 w-4 shrink-0 text-niki-ink/40" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-niki-ink">
                            {option.label}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 text-xs text-niki-ink/55">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {describeTransit(option.minDays, option.maxDays)}
                            </span>
                            {option.destinationName ? (
                              <span>Collected at {option.destinationName}</span>
                            ) : null}
                            {option.note ? <span>{option.note}</span> : null}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {option.unpriced ? (
                          <span className="text-xs font-semibold text-niki-ink/50">
                            Not available
                          </span>
                        ) : (
                          <>
                            <span className="block text-sm font-semibold text-niki-ink">
                              {formatPrice(option.fee)}
                            </span>
                            {option.fee === cheapest && group.options.length > 1 ? (
                              <span className="block text-xs font-medium text-niki-success">
                                Cheapest
                              </span>
                            ) : null}
                          </>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-niki-ink/45">
        Each price is the shipping for your whole order on that route — every leg, the duty and the
        taxes already inside it.
      </p>
    </div>
  );
}
