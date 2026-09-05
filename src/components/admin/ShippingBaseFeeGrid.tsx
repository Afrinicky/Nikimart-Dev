"use client";

import { useActionState, useMemo, useState } from "react";
import { Grid3x3, Layers, Ruler } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import { saveShippingLaneFees, type ShippingState } from "@/lib/shipping-admin-actions";

/** A row and a column of the grid: one place goods pass through. */
export interface GridLocation {
  key: string;
  name: string;
  /** Town or campus. */
  where: string;
  /** The forwarder who owns it, blank when it is ours. */
  ownerName: string;
  /** True when goods can gather here — only such a place can start a run. */
  isConsolidation: boolean;
  /** True when buyers collect here — only such a place can end one. */
  isPickup: boolean;
  isActive: boolean;
}

/** A cell somebody has already priced. */
export interface GridLane {
  originKey: string;
  destKey: string;
  baseFee: number | null;
  perUnitFee: number | null;
  largeRatePerCbm: number;
  largeMinFee: number;
  isActive: boolean;
}

type Layer = "base" | "unit" | "large";

/** The four amounts one cell can carry, as typed. */
interface CellValue {
  base: string;
  unit: string;
  cbm: string;
  min: string;
}

const EMPTY: CellValue = { base: "", unit: "", cbm: "", min: "" };

const cellKey = (originKey: string, destKey: string) => `${originKey}|${destKey}`;

/** A stored amount as a form value. Zero is a real answer, null is an empty box. */
function amount(n: number | null): string {
  return n === null || n === undefined ? "" : String(n);
}

const cellInput =
  "w-full rounded-lg border border-niki-edge-strong bg-white px-2 py-1.5 text-center font-figures text-sm text-niki-ink outline-none transition-colors placeholder:font-sans placeholder:text-xs placeholder:text-niki-ink/30 focus:border-niki-orange focus:ring-2 focus:ring-niki-orange/20";

const LAYERS = [
  { id: "base" as const, label: "First item", icon: Grid3x3 },
  { id: "unit" as const, label: "Each extra", icon: Layers },
  { id: "large" as const, label: "Large items", icon: Ruler },
];

/**
 * Every run on the platform, priced in one table.
 *
 * The rows and the columns are the same list — every location, ours and the
 * forwarders' — because a run goes from somewhere to somewhere and both ends
 * are places on the same map. An earlier version drew rows from the
 * consolidation points and columns from the pickup stations, which are two
 * different lists: the table was not square, and a journey between two places
 * both visible on the screen could not be priced.
 *
 * Nothing here is a fixed list. Locations come from the database, so a station
 * or a depot created this morning is a row and a column this morning, priced by
 * the platform defaults until somebody types in the cell.
 *
 * Three things this screen is careful about:
 *
 * **Empty is not zero.** A blank cell has no opinion and the journey is priced
 * by the platform default; a typed zero is a decision — free, or no increment.
 * The placeholder in every empty box shows what it would fall back to.
 *
 * **A place to itself is not a journey.** The diagonal is struck out: goods
 * collected where they already sit have nothing left to charge for.
 *
 * **The whole cell is saved, not the visible layer.** The three layers are one
 * form; switching tabs never drops what you typed on another.
 */
export function ShippingBaseFeeGrid({
  locations,
  lanes,
  defaults,
  large,
}: {
  locations: GridLocation[];
  lanes: GridLane[];
  defaults: { baseFee: number; perUnitFee: number; minFee: number };
  large: { enabled: boolean; ratePerCbm: number; extraPercent: number };
}) {
  const [state, formAction] = useActionState<ShippingState, FormData>(saveShippingLaneFees, {});
  const [layer, setLayer] = useState<Layer>("base");

  const initial = useMemo(() => {
    const map: Record<string, CellValue> = {};
    for (const l of lanes) {
      map[cellKey(l.originKey, l.destKey)] = {
        base: amount(l.baseFee),
        unit: amount(l.perUnitFee),
        cbm: l.largeRatePerCbm ? String(l.largeRatePerCbm) : "",
        min: l.largeMinFee ? String(l.largeMinFee) : "",
      };
    }
    return map;
  }, [lanes]);

  const [cells, setCells] = useState<Record<string, CellValue>>(initial);

  const valueAt = (k: string): CellValue => cells[k] ?? EMPTY;
  const set = (k: string, part: Partial<CellValue>) =>
    setCells((prev) => ({ ...prev, [k]: { ...(prev[k] ?? EMPTY), ...part } }));

  // Every location against every other one. A place to itself is not a journey,
  // and nothing else is excluded: a run can be priced before the place at
  // either end plays the role that makes it live, and pricing ahead of the
  // switch beats discovering on the day that the cell was never offered.
  const journeys = locations.length * Math.max(0, locations.length - 1);
  const priced = Object.entries(cells).filter(
    ([, v]) => v.base !== "" || v.unit !== "" || v.cbm !== "",
  ).length;
  // A run the engine cannot route yet: goods never gather at the origin, or
  // nobody collects at the destination. The cell is still editable — it is a
  // price, not a promise — but it is shaded, and this says why.
  const dormant = locations.some((o) => !o.isConsolidation) || locations.some((d) => !d.isPickup);

  if (locations.length < 2) {
    return (
      <p className="rounded-2xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900">
        A run needs two places. Add another location and this grid fills itself in.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {LAYERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setLayer(id)}
              aria-pressed={layer === id}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                layer === id
                  ? "niki-chip-active bg-niki-black text-white"
                  : "niki-chip text-niki-ink/75 hover:text-niki-ink",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-niki-ink/55">
          {priced} of {journeys} journeys priced here
        </p>
      </div>

      <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/70 ring-1 ring-niki-edge">
        {layer === "base" ? (
          <>
            What the <span className="font-medium text-niki-ink">first item</span> costs on each
            run, charged once for the load. Leave a cell empty to price it by the platform default
            of {formatPrice(defaults.baseFee)}; type <span className="font-figures">0</span> to make
            that run free.
          </>
        ) : layer === "unit" ? (
          <>
            What <span className="font-medium text-niki-ink">every item after the first</span> adds
            on that run. One shop&apos;s ten bottles are one van: one first item, nine of these.
            Empty falls back to {formatPrice(defaults.perUnitFee)}; zero means extra items ride
            free.
          </>
        ) : (
          <>
            A fridge is not a base fee with a fridge in it. Goods that trip the large-item
            thresholds are priced by the space they take:{" "}
            <span className="font-medium text-niki-ink">GH₵ per cubic metre</span> on the run, with
            a floor under it. The biggest one in a load sets the base and the rest are increments at{" "}
            {large.extraPercent}% of their own size. An empty cell falls back to{" "}
            {large.ratePerCbm > 0 ? `${formatPrice(large.ratePerCbm)} per m³` : "the flat base fee"}
            .
          </>
        )}
      </p>

      <div className="overflow-x-auto rounded-2xl ring-1 ring-niki-edge">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-niki-edge bg-niki-surface">
              <th className="sticky left-0 z-10 min-w-[220px] bg-niki-surface px-4 py-3 text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
                From ↓ &nbsp; To →
              </th>
              {locations.map((d) => (
                <th
                  key={d.key}
                  className="min-w-[132px] px-3 py-3 text-center text-xs font-semibold text-niki-ink/70"
                >
                  {d.name}
                  {d.where ? (
                    <span className="block font-normal text-niki-ink/40">{d.where}</span>
                  ) : null}
                  {!d.isPickup ? (
                    <span className="block font-normal text-niki-ink/40">no collection yet</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-niki-edge">
            {locations.map((o) => (
              <tr key={o.key} className={o.isActive ? "" : "opacity-60"}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-4 py-2.5 text-left align-middle font-medium text-niki-ink"
                >
                  {o.name}
                  <span className="block text-xs font-normal text-niki-ink/45">
                    {o.ownerName || "Nikimart"}
                    {o.where ? ` · ${o.where}` : ""}
                    {o.isActive ? "" : " · retired"}
                  </span>
                </th>

                {locations.map((d) => {
                  // The goods are already on the shelf the buyer is collecting
                  // from. There is no journey to price, and the engine charges
                  // nothing for it whatever this grid says.
                  if (o.key === d.key) {
                    return (
                      <td key={d.key} className="bg-niki-success/5 px-3 py-2.5 text-center">
                        <span className="text-xs font-semibold text-niki-success">
                          Collected here
                        </span>
                      </td>
                    );
                  }

                  const k = cellKey(o.key, d.key);
                  const v = valueAt(k);
                  const label = `from ${o.name} to ${d.name}`;
                  // Priceable, but not yet routable: goods do not gather at the
                  // origin, or nobody collects at the destination.
                  const asleep = !o.isConsolidation || !d.isPickup;
                  const why = !o.isConsolidation
                    ? `Goods don't gather at ${o.name} yet, so nothing leaves it. The price is kept for when they do.`
                    : `Buyers don't collect at ${d.name} yet, so no run ends there. The price is kept for when they do.`;

                  // Whichever layer is on screen, the other two ride along as
                  // hidden inputs: a grid that quietly dropped the layer you
                  // were not looking at would be a data-loss bug wearing a tab.
                  const hidden = (["base", "unit", "cbm", "min"] as const)
                    .filter((f) => (layer === "large" ? f === "base" || f === "unit" : f !== layer))
                    .map((f) => (
                      <input key={f} type="hidden" name={`${f}|${k}`} value={v[f]} />
                    ));

                  return (
                    <td
                      key={d.key}
                      title={asleep ? why : undefined}
                      className={cn("px-3 py-2.5", asleep && "bg-niki-surface/70")}
                    >
                      {layer === "large" ? (
                        <div className="space-y-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            name={`cbm|${k}`}
                            aria-label={`Rate per cubic metre for large items ${label}`}
                            value={v.cbm}
                            onChange={(e) => set(k, { cbm: e.target.value })}
                            placeholder="per m³"
                            className={cellInput}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            name={`min|${k}`}
                            aria-label={`Minimum large-item fee ${label}`}
                            value={v.min}
                            onChange={(e) => set(k, { min: e.target.value })}
                            placeholder="minimum"
                            className={cellInput}
                          />
                        </div>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          name={`${layer}|${k}`}
                          aria-label={`${layer === "base" ? "First item" : "Each extra item"} ${label}`}
                          value={layer === "base" ? v.base : v.unit}
                          onChange={(e) =>
                            set(k, layer === "base" ? { base: e.target.value } : { unit: e.target.value })
                          }
                          placeholder={String(layer === "base" ? defaults.baseFee : defaults.perUnitFee)}
                          className={cellInput}
                        />
                      )}
                      {hidden}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dormant ? (
        <p className="text-xs text-niki-ink/55">
          A shaded cell prices a run nothing travels on yet — goods don&apos;t gather at that
          origin, or buyers don&apos;t collect at that destination. The price is saved and starts
          applying the moment you tick that role on the Locations screen.
        </p>
      ) : null}

      {!large.enabled && layer === "large" ? (
        <p className="rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900">
          Large-item pricing is switched off below, so nothing on this layer is being charged. The
          rates stay saved and start applying the moment it is switched back on.
        </p>
      ) : null}

      <FormFeedback error={state.error} success={state.ok ? (state.message ?? "Saved ✓") : undefined} />
      <div className="w-48">
        <SubmitButton>Save the grid</SubmitButton>
      </div>
    </form>
  );
}
