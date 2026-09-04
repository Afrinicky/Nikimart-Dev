"use client";

import { useState } from "react";
import { Boxes, Calculator, Globe2, Link2, Package, Truck, Wallet } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import {
  EMPTY_ABROAD_TERMS,
  isSafeSourceUrl,
  serialiseAbroadTerms,
  type AbroadTerms,
} from "@/lib/abroad";
import {
  billableWeightKg,
  cbmFromDimensions,
  describePoint,
  describeRoute,
  describeTransit,
  freightModeLabel,
  quoteShipment,
  resolveGoodsClasses,
  resolveLaneRate,
  routesToPoint,
  SHIPPING_METHODS,
  SHIPPING_METHOD_HINTS,
  SHIPPING_METHOD_LABELS,
  type ConsolidationPoint,
  type Forwarder,
  type ShippingConfig,
  type ShippingMethod,
} from "@/lib/shipping";
import { FOREIGN_COUNTRIES } from "@/lib/countries";
import { formatPrice } from "@/lib/format";

/**
 * Everything a seller says about getting one product to a buyer.
 *
 * One section, three questions, in the order a seller can actually answer them.
 * How is it shipped? How big is it? And, only if it comes from abroad, how does
 * it get here — which is two arrangements, not a form full of legs:
 *
 *   - the supplier's price already reaches Ghana, or
 *   - a forwarder brings it, and the seller pays to reach that forwarder.
 *
 * For the second, the choice is made in the order the goods travel: which
 * forwarder, which of *their* Ghana warehouses, and which of the modes they run
 * into it. The rate appears the moment the category and the dimensions are in,
 * because the category decides the forwarder's class and the dimensions decide
 * the cubic metres — and those two are the whole of their price.
 *
 * The estimate at the bottom runs the same `quoteShipment` the checkout and the
 * order action run, so what a seller reads here is what a buyer is charged.
 */
export function ShippingField({
  initial,
  isAbroad,
  points,
  forwarders,
  config,
  price,
  categoryId,
  method: initialMethod,
  manualFee: initialManualFee,
  shippingOnPickup: initialOnPickup,
  size: initialSize,
  payOnPickupEnabled,
  sampleDestinationId,
}: {
  initial: AbroadTerms | null;
  /** True when the selected type is shipped-from-abroad. */
  isAbroad: boolean;
  points: ConsolidationPoint[];
  forwarders: Forwarder[];
  config: ShippingConfig;
  price: number;
  categoryId: string;
  method: ShippingMethod;
  manualFee: number;
  shippingOnPickup: boolean;
  size: { shippingWeightKg: number; lengthCm: number; widthCm: number; heightCm: number; cbm: number };
  payOnPickupEnabled: boolean;
  /**
   * A pickup station to price the estimate against — any station that is not
   * the goods' own. The real fee depends on where the buyer collects, and an
   * estimate that quietly assumed the free case would be a lie by omission.
   */
  sampleDestinationId: string;
}) {
  const [terms, setTerms] = useState<AbroadTerms>(initial ?? EMPTY_ABROAD_TERMS);
  const [method, setMethod] = useState<ShippingMethod>(initialMethod);
  const [manualFee, setManualFee] = useState(initialManualFee);
  const [onPickup, setOnPickup] = useState(initialOnPickup);
  const [size, setSize] = useState(initialSize);

  const set = <K extends keyof AbroadTerms>(key: K, value: AbroadTerms[K]) =>
    setTerms((prev) => ({ ...prev, [key]: value }));

  // The terms only belong to an imported listing. Submitting them empty for
  // anything else is what stops a listing switched to "in stock" from keeping
  // freight nothing on the page would then show.
  const serialised = isAbroad ? (serialiseAbroadTerms(terms) ?? "") : "";

  // --- The chain: forwarder → their warehouse → the mode into it -------------
  const forwarder = forwarders.find((f) => f.id === terms.forwarderId) ?? null;
  const forwarderPoints = (forwarder?.consolidations ?? []).filter((p) => p.isActive);
  const localPoints = points.filter((p) => !p.forwarderId);

  const point =
    (isAbroad && !terms.supplierDelivers
      ? forwarderPoints.find((p) => p.id === terms.consolidationPointId)
      : points.find((p) => p.id === terms.consolidationPointId)) ?? null;

  const lanes = routesToPoint(forwarder, point?.id ?? null);
  const route = lanes.find((r) => r.id === terms.routeId) ?? null;

  // Every class this category falls into, and their rates added together. A
  // fridge is a normal good and an appliance; the forwarder charges for both.
  const goodsClasses = resolveGoodsClasses(forwarder, categoryId);
  const lane = resolveLaneRate(route, goodsClasses);
  const laneCarriesClass = lane.isAvailable;
  const classNames = goodsClasses.map((g) => g.name).join(" + ");
  const rateParts = goodsClasses
    .map((g) => ({ name: g.name, cell: route?.rates.find((r) => r.goodsClassId === g.id) }))
    .filter((x): x is { name: string; cell: NonNullable<typeof x.cell> } => Boolean(x.cell));

  // --- Size ------------------------------------------------------------------
  // The volume is worked out from the dimensions the moment all three are in.
  // A seller should never have to divide by a million.
  const derivedCbm = cbmFromDimensions(size.lengthCm, size.widthCm, size.heightCm);
  const perUnitCbm = size.cbm > 0 ? size.cbm : derivedCbm;
  const weight = billableWeightKg(size, config.defaults.volumetricDivisor);

  // --- The estimate ----------------------------------------------------------
  //
  // Not memoised: this is pure arithmetic on a handful of numbers, and the
  // dependency list a memo would need includes objects looked up from props on
  // every render — so the cache would miss anyway.
  const estimateLine = (quantity: number) => ({
    vendorId: "estimate",
    quantity,
    unitPrice: price || 0,
    size: { ...size, cbm: perUnitCbm },
    categoryId,
    method,
    manualFee,
    originCountry: isAbroad ? terms.originCountry || forwarder?.originCountry || "CN" : "GH",
    point,
    forwarder: isAbroad && !terms.supplierDelivers ? forwarder : null,
    routeId: terms.routeId || null,
    supplierDelivers: isAbroad ? terms.supplierDelivers : false,
    supplierFreight: isAbroad ? terms.supplierFreight : 0,
  });

  const one = quoteShipment([estimateLine(1)], sampleDestinationId, config);
  const estimate = one.perLine[0];
  const twoFee = quoteShipment([estimateLine(2)], sampleDestinationId, config).quote.fee;

  const badUrl = terms.sourceUrl.trim().length > 0 && !isSafeSourceUrl(terms.sourceUrl);
  const needsLane = isAbroad && method === "auto" && !terms.supplierDelivers;

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <input type="hidden" name="abroadTerms" value={serialised} />
      <input type="hidden" name="freightMode" value={isAbroad ? (route?.mode ?? "") : ""} />

      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-niki-orange" />
        <h2 className="font-display text-lg font-bold text-niki-ink">Shipping</h2>
      </div>
      <p className="mt-1 text-sm text-niki-ink/65">
        Buyers see one shipping figure at checkout — the cost of getting this item to the station
        they collect from. Everything below feeds that number.
      </p>

      {/* --- 1. How is it shipped? ------------------------------------------ */}
      <Block icon={Package} title="How is it shipped?">
        <div className="grid gap-2 sm:grid-cols-3">
          {SHIPPING_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              aria-pressed={method === m}
              className={`rounded-xl border p-4 text-left transition-colors ${
                method === m
                  ? "border-niki-orange bg-niki-orange/5"
                  : "border-niki-edge-strong hover:bg-niki-surface"
              }`}
            >
              <span className="block text-sm font-semibold text-niki-ink">
                {SHIPPING_METHOD_LABELS[m]}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-niki-ink/60">
                {SHIPPING_METHOD_HINTS[m]}
              </span>
            </button>
          ))}
        </div>
        <input type="hidden" name="shippingMethod" value={method} />

        {method === "manual" ? (
          <Field
            label="Shipping fee per unit (GH₵)"
            htmlFor="manualShippingFee"
            hint="Charged whole, to any pickup station. Nothing is added to it — that is the point of quoting a special shipment by hand."
          >
            <input
              id="manualShippingFee"
              name="manualShippingFee"
              type="number"
              min={0}
              step="0.01"
              value={manualFee || ""}
              onChange={(e) => setManualFee(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
        ) : (
          <input type="hidden" name="manualShippingFee" value="0" />
        )}

        {/* An imported listing gathers at its forwarder's warehouse, chosen
            below with the lane. Only a domestic one picks a point here. */}
        {!isAbroad ? (
          <Field
            label="Where your goods gather"
            htmlFor="consolidationPointId"
            hint={
              localPoints.length === 0
                ? "No consolidation points are set up yet — ask an admin to add one."
                : "The point this item is brought to and checked before a courier takes it onward. A buyer collecting at that same station pays nothing."
            }
          >
            <select
              id="consolidationPointId"
              name="consolidationPointId"
              value={terms.consolidationPointId}
              onChange={(e) => set("consolidationPointId", e.target.value)}
              className={inputClass}
            >
              <option value="">Use my shop&apos;s usual point</option>
              {localPoints.map((p) => (
                <option key={p.id} value={p.id}>
                  {describePoint(p)}
                  {p.pickupPointId ? " · free to collect here" : ""}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <input type="hidden" name="consolidationPointId" value={terms.consolidationPointId} />
        )}

        {payOnPickupEnabled && method !== "free" ? (
          <label className="flex items-start gap-3 rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge">
            <input
              type="checkbox"
              name="shippingOnPickup"
              checked={onPickup}
              onChange={(e) => setOnPickup(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded"
            />
            <span className="text-sm text-niki-ink/80">
              <span className="font-medium text-niki-ink">
                Let buyers pay the shipping when they collect.
              </span>{" "}
              They still pay the full item price at checkout — that is your money, spent as soon as
              you fulfil the order. Only the shipping waits until they are at the station.
            </span>
          </label>
        ) : null}
      </Block>

      {/* --- 2. How big is it? ---------------------------------------------- */}
      <Block icon={Boxes} title="How big is it?">
        <p className="text-sm text-niki-ink/65">
          Couriers charge for whatever is greater: what a parcel weighs, or what its size says it
          weighs. Freight from abroad is charged on the volume. Give the three dimensions and the
          cubic metres are worked out for you.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          {(
            [
              ["shippingWeightKg", "Weight (kg)", "0.1"],
              ["lengthCm", "Length (cm)", "0.1"],
              ["widthCm", "Width (cm)", "0.1"],
              ["heightCm", "Height (cm)", "0.1"],
            ] as const
          ).map(([key, label, step]) => (
            <Field key={key} label={label} htmlFor={key}>
              <input
                id={key}
                name={key}
                type="number"
                min={0}
                step={step}
                value={size[key] || ""}
                onChange={(e) => setSize((s) => ({ ...s, [key]: Number(e.target.value) || 0 }))}
                className={inputClass}
              />
            </Field>
          ))}
        </div>

        <div className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/70 ring-1 ring-niki-edge">
          Billed at <span className="font-figures font-semibold text-niki-ink">{weight} kg</span>{" "}
          inside Ghana
          {isAbroad ? (
            <>
              , and{" "}
              <span className="font-figures font-semibold text-niki-ink">
                {perUnitCbm.toFixed(4)} m³
              </span>{" "}
              per unit on the leg from abroad
            </>
          ) : null}
          .
        </div>

        {isAbroad ? (
          <Field
            label="Override the volume (CBM per unit)"
            htmlFor="cbm"
            hint="Leave blank to use the figure worked out from the dimensions above. Set it only when the supplier quotes a packed volume of their own."
          >
            <input
              id="cbm"
              name="cbm"
              type="number"
              min={0}
              step="0.0001"
              value={size.cbm || ""}
              onChange={(e) => setSize((s) => ({ ...s, cbm: Number(e.target.value) || 0 }))}
              placeholder={derivedCbm > 0 ? derivedCbm.toFixed(4) : ""}
              className={inputClass}
            />
          </Field>
        ) : (
          <input type="hidden" name="cbm" value={size.cbm || ""} />
        )}
      </Block>

      {/* --- 3. How does it get here? --------------------------------------- */}
      {isAbroad ? (
        <>
          <Block icon={Globe2} title="How does it get to Ghana?">
            <Field
              label="Country of purchase"
              htmlFor="abroadOrigin"
              hint="Where the goods are bought. Buyers find this listing under it."
            >
              <select
                id="abroadOrigin"
                value={terms.originCountry}
                onChange={(e) => set("originCountry", e.target.value)}
                className={inputClass}
              >
                <option value="">Use my shop&apos;s country</option>
                {FOREIGN_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTerms((t) => ({ ...t, supplierDelivers: true }))}
                aria-pressed={terms.supplierDelivers}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  terms.supplierDelivers
                    ? "border-niki-orange bg-niki-orange/5"
                    : "border-niki-edge-strong hover:bg-niki-surface"
                }`}
              >
                <span className="block text-sm font-semibold text-niki-ink">
                  My supplier delivers to Ghana
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-niki-ink/60">
                  Their price already puts it at a consolidation point here. Nothing is charged to
                  bring it in — the buyer pays only the run from there to their station.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTerms((t) => ({ ...t, supplierDelivers: false }))}
                aria-pressed={!terms.supplierDelivers}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  !terms.supplierDelivers
                    ? "border-niki-orange bg-niki-orange/5"
                    : "border-niki-edge-strong hover:bg-niki-surface"
                }`}
              >
                <span className="block text-sm font-semibold text-niki-ink">
                  A freight forwarder brings it
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-niki-ink/60">
                  You send it to their warehouse abroad; their rate per cubic metre carries it to
                  their warehouse in Ghana.
                </span>
              </button>
            </div>

            {terms.supplierDelivers ? (
              <Field
                label="Where the supplier delivers to"
                htmlFor="supplierPoint"
                hint="The consolidation point their price already reaches."
              >
                <select
                  id="supplierPoint"
                  value={terms.consolidationPointId}
                  onChange={(e) =>
                    setTerms((t) => ({ ...t, consolidationPointId: e.target.value, routeId: "" }))
                  }
                  className={inputClass}
                >
                  <option value="">Choose…</option>
                  {points.map((p) => (
                    <option key={p.id} value={p.id}>
                      {describePoint(p)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field
                    label="Freight forwarder"
                    htmlFor="abroadForwarder"
                    hint={
                      forwarders.length === 0
                        ? "None are registered yet — ask an admin to add one."
                        : "Who consolidates and carries your goods."
                    }
                  >
                    <select
                      id="abroadForwarder"
                      value={terms.forwarderId}
                      onChange={(e) =>
                        setTerms((t) => ({
                          ...t,
                          forwarderId: e.target.value,
                          consolidationPointId: "",
                          routeId: "",
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="">Choose…</option>
                      {forwarders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                          {f.originCountry ? ` — ${f.originCountry}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Their consolidation point"
                    htmlFor="abroadPoint"
                    hint={
                      forwarder && forwarderPoints.length === 0
                        ? "This forwarder has no Ghana warehouse set up yet."
                        : "Where your goods land in Ghana."
                    }
                  >
                    <select
                      id="abroadPoint"
                      value={terms.consolidationPointId}
                      onChange={(e) =>
                        setTerms((t) => ({ ...t, consolidationPointId: e.target.value, routeId: "" }))
                      }
                      disabled={!forwarder}
                      className={inputClass}
                    >
                      <option value="">Choose…</option>
                      {forwarderPoints.map((p) => (
                        <option key={p.id} value={p.id}>
                          {describePoint(p)}
                          {p.pickupPointId ? " · free to collect here" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Route"
                    htmlFor="abroadRoute"
                    hint={
                      point && lanes.length === 0
                        ? "No modes run into that point yet."
                        : "The mode this item travels on."
                    }
                  >
                    <select
                      id="abroadRoute"
                      value={terms.routeId}
                      onChange={(e) => set("routeId", e.target.value)}
                      disabled={!point}
                      className={inputClass}
                    >
                      <option value="">Choose…</option>
                      {lanes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {describeRoute(r)}
                          {r.maxDays > 0 ? ` · ${describeTransit(r.minDays, r.maxDays)}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                {forwarder?.collectionAddress ? (
                  <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/70 ring-1 ring-niki-edge">
                    <span className="font-medium text-niki-ink">
                      Send the goods to {forwarder.name}:
                    </span>{" "}
                    {forwarder.collectionAddress}
                    {forwarder.collectionCity ? `, ${forwarder.collectionCity}` : ""}
                    {forwarder.contactPhone ? ` · ${forwarder.contactPhone}` : ""}
                  </p>
                ) : null}

                <Field
                  label="Getting it to the forwarder (GH₵ per unit)"
                  htmlFor="abroadSupplierFreight"
                  hint="What the supplier charges to deliver one unit to that warehouse abroad. The buyer pays it as part of the shipping."
                >
                  <input
                    id="abroadSupplierFreight"
                    type="number"
                    min={0}
                    step="0.01"
                    value={terms.supplierFreight || ""}
                    onChange={(e) => set("supplierFreight", Number(e.target.value) || 0)}
                    className={inputClass}
                  />
                </Field>

                {route ? (
                  <div
                    className={`rounded-xl px-4 py-3 text-sm ring-1 ${
                      laneCarriesClass
                        ? "bg-niki-success/5 text-niki-ink/75 ring-niki-success/20"
                        : "bg-niki-danger/10 font-medium text-niki-danger ring-niki-danger/20"
                    }`}
                  >
                    {laneCarriesClass ? (
                      <>
                        {forwarder?.name} carries this as{" "}
                        <span className="font-semibold text-niki-ink">
                          {classNames || "their standard class"}
                        </span>{" "}
                        by {freightModeLabel(route.mode).toLowerCase()} at{" "}
                        <span className="font-figures font-semibold text-niki-ink">
                          {lane.ratePerCbm} {route.currency}
                        </span>{" "}
                        per m³
                        {rateParts.length > 1
                          ? ` (${rateParts.map((x) => `${x.name} ${x.cell.ratePerCbm}`).join(" + ")})`
                          : ""}
                        {route.maxDays > 0
                          ? `, ${describeTransit(route.minDays, route.maxDays)}`
                          : ""}
                        {route.minCbm > 0
                          ? `. They ship nothing under ${route.minCbm} m³, so orders are held until a batch reaches it.`
                          : "."}
                      </>
                    ) : (
                      <>
                        {forwarder?.name} does not carry{" "}
                        {classNames || "this category"} by{" "}
                        {freightModeLabel(route.mode).toLowerCase()} into that point, so this item
                        can&apos;t be bought on it. Choose another route or another forwarder.
                      </>
                    )}
                  </div>
                ) : needsLane ? (
                  <p className="rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900">
                    Pick a forwarder, their consolidation point and a route. Until you do, nothing
                    prices the leg into Ghana and buyers can&apos;t order this.
                  </p>
                ) : null}

                {forwarder?.terms ? (
                  <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/70 ring-1 ring-niki-edge">
                    <span className="font-medium text-niki-ink">{forwarder.name} note:</span>{" "}
                    {forwarder.terms}
                  </p>
                ) : null}
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Estimated arrival"
                htmlFor="abroadArrival"
                hint="In your own words. Buyers read this before ordering."
              >
                <input
                  id="abroadArrival"
                  value={terms.estimatedArrival}
                  onChange={(e) => set("estimatedArrival", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Supplier lead time (days)"
                htmlFor="abroadProcessing"
                hint="How long the supplier needs before the goods reach the forwarder."
              >
                <input
                  id="abroadProcessing"
                  type="number"
                  min={0}
                  value={terms.processingDays || ""}
                  onChange={(e) => set("processingDays", Number(e.target.value) || 0)}
                  className={inputClass}
                />
              </Field>
            </div>
          </Block>

          <Block icon={Link2} title="Who you are buying from">
            <p className="text-sm text-niki-ink/65">
              These are what an admin uses to place the order when enough of it has sold, so the
              link has to lead to the exact item.
            </p>
            <Field
              label="Supplier link"
              htmlFor="abroadSourceUrl"
              hint={
                badUrl
                  ? "That doesn't look like a web address. Paste the full link, starting with https://"
                  : "The Alibaba, 1688, Amazon or other listing you are buying from."
              }
            >
              <input
                id="abroadSourceUrl"
                value={terms.sourceUrl}
                onChange={(e) => set("sourceUrl", e.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Supplier name" htmlFor="abroadSupplier">
                <input
                  id="abroadSupplier"
                  value={terms.supplierName}
                  onChange={(e) => set("supplierName", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Supplier contact" htmlFor="abroadSupplierContact" hint="Phone, WeChat or email.">
                <input
                  id="abroadSupplierContact"
                  value={terms.supplierContact}
                  onChange={(e) => set("supplierContact", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Ships from" htmlFor="abroadSourceLocation" hint="City and country, in words.">
                <input
                  id="abroadSourceLocation"
                  value={terms.sourceLocation}
                  onChange={(e) => set("sourceLocation", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </Block>

          <Block icon={Wallet} title="What you promise buyers">
            <Field
              label="Refund policy"
              htmlFor="abroadRefund"
              hint="What happens if it is late, cancelled, or never arrives. This is the term buyers ask about most."
            >
              <textarea
                id="abroadRefund"
                rows={2}
                value={terms.refundPolicy}
                onChange={(e) => set("refundPolicy", e.target.value)}
                className={inputClass}
              />
            </Field>
            {onPickup ? (
              <Field
                label="How the shipping is settled at collection"
                htmlFor="abroadBalance"
                hint="Shown to buyers who choose to pay the shipping when they collect."
              >
                <textarea
                  id="abroadBalance"
                  rows={2}
                  value={terms.balanceInstruction}
                  onChange={(e) => set("balanceInstruction", e.target.value)}
                  className={inputClass}
                />
              </Field>
            ) : null}
            <Field
              label="Minimum orders before you buy the batch"
              htmlFor="abroadMinimum"
              hint="0 means it is bought whenever the forwarder's minimum volume is reached."
            >
              <input
                id="abroadMinimum"
                type="number"
                min={0}
                value={terms.minimumOrders || ""}
                onChange={(e) => set("minimumOrders", Number(e.target.value) || 0)}
                className={inputClass}
              />
            </Field>
          </Block>
        </>
      ) : null}

      {/* --- The estimate ---------------------------------------------------- */}
      <div className="mt-6 rounded-2xl bg-niki-black p-5 text-white">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-niki-orange" />
          <h3 className="font-display text-base font-bold">What a buyer will pay</h3>
        </div>
        <dl className="mt-4 space-y-1.5 text-sm">
          <Row label="Item price" value={price || 0} />
          {isAbroad && method === "auto" && !terms.supplierDelivers ? (
            <>
              <Row label="To the forwarder abroad" value={estimate.supplierFreight} />
              <Row
                label={`Freight into ${point ? point.name : "Ghana"}`}
                value={estimate.internationalFreight}
              />
            </>
          ) : null}
          <Row
            label={
              method === "manual"
                ? "Shipping — your fixed fee"
                : isAbroad
                  ? "Inside Ghana, to a station away from that point"
                  : "Shipping to a station away from your point"
            }
            value={method === "manual" ? estimate.fee : estimate.localFreight}
          />
          <div className="flex justify-between border-t border-white/15 pt-2 font-bold">
            <dt>Total for one</dt>
            <dd className="font-figures text-niki-orange">
              {formatPrice((price || 0) + estimate.fee)}
            </dd>
          </div>
        </dl>
        {method === "auto" ? (
          <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs leading-relaxed text-white/75">
            Buying two costs{" "}
            <span className="font-figures font-bold text-white">{formatPrice(twoFee)}</span> to ship,
            not {formatPrice(estimate.fee * 2)} — the base fee inside Ghana is charged once per
            order from your shop.
          </p>
        ) : null}
        {estimate.unpricedRoute ? (
          <p className="mt-3 rounded-xl bg-niki-danger/25 px-3 py-2 text-xs font-medium text-white">
            Nothing prices the leg into Ghana yet, so buyers can&apos;t order this.
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-white/60">
          {method === "free"
            ? "You are absorbing the shipping, so buyers pay the item price wherever they collect."
            : point?.pickupPointId
              ? "A buyer collecting at that consolidation point pays nothing for the run inside Ghana. Anywhere else costs the figure above."
              : "The run inside Ghana moves with the station a buyer picks."}
        </p>
      </div>
    </section>
  );
}

function Block({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Truck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 space-y-4 border-t border-niki-edge pt-5">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-niki-ink/60">
        <Icon className="h-4 w-4 text-niki-orange" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3 text-white/75">
      <dt>{label}</dt>
      <dd className="shrink-0 font-medium text-white">
        {value === 0 ? "Free" : formatPrice(value)}
      </dd>
    </div>
  );
}
