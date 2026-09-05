"use client";

import { useActionState, useMemo, useState } from "react";
import { Grid3x3, Ruler } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import { saveShippingLaneFees, type ShippingState } from "@/lib/shipping-admin-actions";

/** A row of the grid: somewhere a consignment leaves from. */
export interface GridOrigin {
  id: string;
  label: string;
  /** Who owns the point — a forwarder's name, or blank for ours. */
  owner: string;
  /** The pickup station this point sits at, when it sits at one. */
  atPickupId: string | null;
  isActive: boolean;
}

/** A column of the grid: a station a buyer collects from. */
export interface GridStation {
  id: string;
  label: string;
}

/** A cell somebody has already priced. */
export interface GridLane {
  originPointId: string;
  destPickupId: string;
  baseFee: number | null;
  largeRatePerCbm: number;
  largeMinFee: number;
  isActive: boolean;
}

type Layer = "base" | "large";

/** The three amounts one cell can carry, as typed. */
interface CellValue {
  base: string;
  cbm: string;
  min: string;
}

const EMPTY: CellValue = { base: "", cbm: "", min: "" };

const key = (originId: string, stationId: string) => `${originId}:${stationId}`;

/** A stored amount as a form value. Zero is a real answer, null is an empty box. */
function amount(n: number | null): string {
  return n === null || n === undefined ? "" : String(n);
}

const cellInput =
  "w-full rounded-lg border border-niki-edge-strong bg-white px-2 py-1.5 text-center font-figures text-sm text-niki-ink outline-none transition-colors placeholder:font-sans placeholder:text-xs placeholder:text-niki-ink/30 focus:border-niki-orange focus:ring-2 focus:ring-niki-orange/20";

/**
 * The base fee, as a grid.
 *
 * One number for every journey on the platform was never going to be right for
 * more than one of them. Sunyani to Hwidiem is not Accra to Sunyani, and a
 * forwarder's Sunyani warehouse to the Nikimart station in the same town is
 * neither. Those are cells of a table, and a table is what an admin should be
 * looking at: origins down the side, stations across the top, and the price of
 * every run visible at once rather than spread over twenty saved rules.
 *
 * Two things this screen is careful about:
 *
 * **Empty is not zero.** A blank cell has no opinion and the journey is priced
 * by the rules and then the platform default. A typed zero is a decision — that
 * run is free. The placeholder in every empty box shows what it would fall back
 * to, so an admin is never guessing which of the two they are looking at.
 *
 * **The increments are not here.** This screen only ever sets what the *first*
 * item costs. What each item after it adds is unchanged, and still lives on the
 * Inside Ghana screen and the platform defaults.
 */
export function ShippingBaseFeeGrid({
  origins,
  stations,
  lanes,
  defaults,
  large,
}: {
  origins: GridOrigin[];
  stations: GridStation[];
  lanes: GridLane[];
  defaults: { baseFee: number; perUnitFee: number; minFee: number };
  large: { enabled: boolean; ratePerCbm: number; extraPercent: number };
}) {
  const [state, formAction] = useActionState<ShippingState, FormData>(saveShippingLaneFees, {});
  const [layer, setLayer] = useState<Layer>("base");

  const initial = useMemo(() => {
    const map: Record<string, CellValue> = {};
    for (const l of lanes) {
      map[key(l.originPointId, l.destPickupId)] = {
        base: amount(l.baseFee),
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

  // What the grid currently says, for the line under the table. Counted from
  // the typed values rather than from the saved ones, so it moves as you edit.
  const priced = Object.entries(cells).filter(([, v]) => v.base !== "" || v.cbm !== "").length;

  if (origins.length === 0 || stations.length === 0) {
    return (
      <p className="rounded-2xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900">
        {origins.length === 0
          ? "There are no consolidation points yet, so there are no journeys to price. Create one on the Local points screen — a forwarder's Ghana warehouse arrives with the forwarder."
          : "There are no active pickup stations yet, so nothing can be collected and no journey has an end. Add one under Admin → Pickup points."}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(
            [
              { id: "base" as const, label: "Base fees", icon: Grid3x3 },
              { id: "large" as const, label: "Large items", icon: Ruler },
            ]
          ).map(({ id, label, icon: Icon }) => (
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
          {priced} of {origins.length * stations.length} journeys priced here
        </p>
      </div>

      <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/70 ring-1 ring-niki-edge">
        {layer === "base" ? (
          <>
            What the <span className="font-medium text-niki-ink">first item</span> costs on each
            run, charged once per seller. Leave a cell empty to price it by the platform default of{" "}
            {formatPrice(defaults.baseFee)}; type <span className="font-figures">0</span> to make
            that run free. Every item after the first still adds the increment, which this screen
            does not touch.
          </>
        ) : (
          <>
            A fridge is not a base fee with a fridge in it. Goods that trip the large-item
            thresholds are priced by the space they take:{" "}
            <span className="font-medium text-niki-ink">GH₵ per cubic metre</span> on the run, with
            a floor under it. The biggest one in a consignment sets the base and the rest are
            increments at {large.extraPercent}% of their own size, so two fridges are one van and
            not two deliveries. An empty cell falls back to{" "}
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
              {stations.map((s) => (
                <th
                  key={s.id}
                  className="min-w-[130px] px-3 py-3 text-center text-xs font-semibold text-niki-ink/70"
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-niki-edge">
            {origins.map((o) => (
              <tr key={o.id} className={o.isActive ? "" : "opacity-60"}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-4 py-2.5 text-left align-middle font-medium text-niki-ink"
                >
                  {o.label}
                  <span className="block text-xs font-normal text-niki-ink/45">
                    {o.owner ? o.owner : "Nikimart"}
                    {o.isActive ? "" : " · retired"}
                  </span>
                </th>

                {stations.map((s) => {
                  const k = key(o.id, s.id);
                  const v = valueAt(k);

                  // The goods are already on the shelf the buyer is collecting
                  // from. There is no journey here to price, and the engine
                  // charges nothing for it whatever this grid says — so the
                  // cell says so instead of inviting a number nobody will use.
                  if (o.atPickupId === s.id) {
                    return (
                      <td key={s.id} className="px-3 py-2.5 text-center">
                        <span className="text-xs font-semibold text-niki-success">
                          Collected here
                        </span>
                      </td>
                    );
                  }

                  if (layer === "base") {
                    return (
                      <td key={s.id} className="px-3 py-2.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          name={`base:${k}`}
                          aria-label={`Base fee from ${o.label} to ${s.label}`}
                          value={v.base}
                          onChange={(e) => set(k, { base: e.target.value })}
                          placeholder={String(defaults.baseFee)}
                          className={cellInput}
                        />
                        {/* The large-item figures for this cell travel with the
                            save even while the other layer is on screen; a grid
                            that quietly dropped the layer you were not looking
                            at would be a data-loss bug wearing a tab. */}
                        <input type="hidden" name={`cbm:${k}`} value={v.cbm} />
                        <input type="hidden" name={`min:${k}`} value={v.min} />
                      </td>
                    );
                  }

                  return (
                    <td key={s.id} className="px-3 py-2.5">
                      <div className="space-y-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          name={`cbm:${k}`}
                          aria-label={`Rate per cubic metre for large items from ${o.label} to ${s.label}`}
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
                          name={`min:${k}`}
                          aria-label={`Minimum large-item fee from ${o.label} to ${s.label}`}
                          value={v.min}
                          onChange={(e) => set(k, { min: e.target.value })}
                          placeholder="minimum"
                          className={cellInput}
                        />
                      </div>
                      <input type="hidden" name={`base:${k}`} value={v.base} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
