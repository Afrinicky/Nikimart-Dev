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
  describePoint,
  priceLine,
  resolveForwarderRate,
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
 * It used to be three places on one form: size and weight up in the general
 * fields, a freight panel that only appeared for imports, and nothing at all
 * for a car nobody could price. A seller filling those in could not see what
 * any of it added up to, and the first honest number they saw was a complaint.
 *
 * So: one section, three questions, in the order a seller can actually answer
 * them. How is it shipped? How big is it? And, only if it comes from abroad,
 * how does it get here — which is two arrangements, not a form full of legs:
 *
 *   - the supplier's price already reaches Ghana, or
 *   - a forwarder brings it, and the seller pays to reach that forwarder.
 *
 * The estimate at the bottom runs the same `priceLine` the checkout and the
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

  const point = points.find((p) => p.id === terms.consolidationPointId) ?? null;
  const forwarder = forwarders.find((f) => f.id === terms.forwarderId) ?? null;
  const rate = resolveForwarderRate(forwarder, categoryId);
  const weight = billableWeightKg(size, config.defaults.volumetricDivisor);

  // Not memoised: `priceLine` is pure arithmetic on a handful of numbers, and
  // the dependency list a memo would need includes objects looked up from
  // props on every render — so the cache would miss anyway while making the
  // estimate look more expensive than it is.
  const estimate = priceLine(
    {
      quantity: 1,
      unitPrice: price || 0,
      size,
      categoryId,
      method,
      manualFee,
      originCountry: isAbroad ? terms.originCountry || "CN" : "GH",
      point,
      forwarder: isAbroad ? forwarder : null,
      supplierDelivers: isAbroad ? terms.supplierDelivers : false,
      supplierFreight: isAbroad ? terms.supplierFreight : 0,
      originTaxRate: isAbroad ? terms.originTaxRate : 0,
      taxRate: isAbroad ? terms.ghanaTaxRate : -1,
      dutyIncluded: isAbroad ? terms.dutyIncluded : false,
    },
    sampleDestinationId,
    config,
  );

  const badUrl = terms.sourceUrl.trim().length > 0 && !isSafeSourceUrl(terms.sourceUrl);
  const unpriced = isAbroad && !terms.supplierDelivers && !rate && config.defaults.fallbackRatePerCbm <= 0;

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <input type="hidden" name="abroadTerms" value={serialised} />

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

        <Field
          label="Where your goods gather"
          htmlFor="consolidationPointId"
          hint={
            points.length === 0
              ? "No consolidation points are set up yet — ask an admin to add one."
              : "The point this item is brought to and checked before a courier takes it onward. A buyer collecting at that same station pays nothing."
          }
        >
          <select
            id="consolidationPointId"
            value={terms.consolidationPointId}
            onChange={(e) => set("consolidationPointId", e.target.value)}
            name={isAbroad ? undefined : "consolidationPointId"}
            className={inputClass}
          >
            <option value="">Use my shop&apos;s usual point</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {describePoint(p)}
                {p.pickupPointId ? " · free to collect here" : ""}
              </option>
            ))}
          </select>
        </Field>
        {/* An imported listing carries its point inside the terms; a local one
            has no terms to carry it, so it posts the field directly. */}
        {isAbroad ? (
          <input type="hidden" name="consolidationPointId" value={terms.consolidationPointId} />
        ) : null}

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
          weighs. Give both and the fee comes out right — a duvet and a dumbbell do not cost the
          same to move.
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
        <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/70 ring-1 ring-niki-edge">
          Billed at <span className="font-figures font-semibold text-niki-ink">{weight} kg</span>
          {isAbroad ? (
            <>
              {" "}
              inside Ghana, and{" "}
              <span className="font-figures font-semibold text-niki-ink">
                {estimate.cbm.toFixed(3)} m³
              </span>{" "}
              on the leg from abroad, which is how forwarders invoice.
            </>
          ) : (
            "."
          )}
        </p>
        {isAbroad ? (
          <Field
            label="Shipping volume (CBM)"
            htmlFor="cbm"
            hint="Cubic metres per unit. Leave blank to work it out from the dimensions above."
          >
            <input
              id="cbm"
              name="cbm"
              type="number"
              min={0}
              step="0.0001"
              value={size.cbm || ""}
              onChange={(e) => setSize((s) => ({ ...s, cbm: Number(e.target.value) || 0 }))}
              placeholder="e.g. 0.045"
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
              hint="Sets the arrival estimate and which origin buyers find this under."
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
                onClick={() => set("supplierDelivers", true)}
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
                  Their price already puts it at the consolidation point above. Nothing is charged
                  to bring it in — the buyer pays only the run from there to their station.
                </span>
              </button>
              <button
                type="button"
                onClick={() => set("supplierDelivers", false)}
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
                  The supplier only reaches the forwarder. Their rate per cubic metre carries it the
                  rest of the way, port fees and duty included.
                </span>
              </button>
            </div>

            {!terms.supplierDelivers ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Freight forwarder"
                    htmlFor="abroadForwarder"
                    hint={
                      forwarders.length === 0
                        ? "None are set up yet — ask an admin to add one."
                        : rate
                          ? `Their price for this category: ${formatPrice(rate.ratePerCbm)} per m³, about ${rate.transitDays} days in transit.`
                          : "Pick the forwarder who consolidates your goods."
                    }
                  >
                    <select
                      id="abroadForwarder"
                      value={terms.forwarderId}
                      onChange={(e) => set("forwarderId", e.target.value)}
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
                    label="Getting it to the forwarder (GH₵ per unit)"
                    htmlFor="abroadSupplierFreight"
                    hint="What the supplier charges to deliver one unit to your forwarder's warehouse abroad."
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
                </div>

                {unpriced ? (
                  <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
                    Nothing prices this route yet, so buyers can&apos;t be quoted for it and the item
                    can&apos;t be bought. Pick a forwarder who has a price for this category, or ask
                    an admin to add one.
                  </p>
                ) : null}
              </>
            ) : null}

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
                  placeholder="4–6 weeks from order"
                  className={inputClass}
                />
              </Field>
              <Field
                label="Supplier lead time (days)"
                htmlFor="abroadProcessing"
                hint="How long the supplier needs before the goods are on their way."
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

          <Block icon={Link2} title="Where you are sourcing it">
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
                placeholder="https://www.alibaba.com/product-detail/..."
                className={inputClass}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supplier name" htmlFor="abroadSupplier">
                <input
                  id="abroadSupplier"
                  value={terms.supplierName}
                  onChange={(e) => set("supplierName", e.target.value)}
                  placeholder="Shenzhen Kaiyuan Trading Co."
                  className={inputClass}
                />
              </Field>
              <Field label="Ships from" htmlFor="abroadSourceLocation" hint="City and country, in words.">
                <input
                  id="abroadSourceLocation"
                  value={terms.sourceLocation}
                  onChange={(e) => set("sourceLocation", e.target.value)}
                  placeholder="Guangzhou, China"
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
                placeholder="Full refund if the item has not arrived within 10 weeks."
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
                  placeholder="Pay the shipping in cash or MoMo at the pickup station."
                  className={inputClass}
                />
              </Field>
            ) : null}
            <Field
              label="Minimum orders before you buy the batch"
              htmlFor="abroadMinimum"
              hint="0 means you order it however few people buy."
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
          <Row
            label={
              method === "manual"
                ? "Shipping — your fixed fee"
                : "Shipping to a station away from your point"
            }
            value={estimate.fee}
          />
          <div className="flex justify-between border-t border-white/15 pt-2 font-bold">
            <dt>Total</dt>
            <dd className="font-figures text-niki-orange">
              {formatPrice((price || 0) + estimate.fee)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-white/60">
          {method === "free"
            ? "You are absorbing the shipping, so buyers pay the item price wherever they collect."
            : point?.pickupPointId
              ? "A buyer collecting at your consolidation point pays no shipping at all. Anywhere else costs the figure above."
              : "The real figure moves with the station a buyer picks. Duty and taxes, where they apply, are already inside it — buyers never see them broken out."}
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
