"use client";

import { useMemo, useState } from "react";
import { Calculator, Globe2, Link2, Plane, Receipt, Wallet } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import {
  EMPTY_ABROAD_TERMS,
  FREIGHT_MODES,
  FREIGHT_MODE_HINTS,
  FREIGHT_MODE_LABELS,
  isSafeSourceUrl,
  serialiseAbroadTerms,
  type AbroadTerms,
  type FreightBasis,
  type FreightMode,
} from "@/lib/abroad";
import { priceAbroadLine } from "@/lib/abroad-costs";
import { resolveArrivalRate, type ArrivalPointConfig } from "@/lib/arrival-points";
import { FOREIGN_COUNTRIES } from "@/lib/countries";
import { formatPrice } from "@/lib/format";

/**
 * How a seller lists something they are sourcing from abroad.
 *
 * The workflow this is built for: the seller finds an item on Alibaba, copies
 * the details and the link, and lists it here. What they have to add is the
 * part Alibaba does not know — how it gets to Ghana and what that costs — and
 * the form is arranged in that order: where it comes from, how it travels, what
 * each leg costs, what the taxman takes, and how the buyer pays.
 *
 * The estimate at the bottom is the point of the whole screen. A seller typing
 * a GH₵400 price and a GH₵90 freight leg has no idea they are about to list an
 * item that lands at GH₵680 until something adds it up in front of them, and a
 * seller who finds that out from a buyer's complaint has already lost the sale.
 * It runs the same `priceAbroadLine` the checkout and the order action run, so
 * the number here is the number charged.
 *
 * Only rendered while the product type is shipped-from-abroad, but the hidden
 * field is always submitted, so switching a product away from that type clears
 * the terms rather than leaving stale freight behind a type that hides it.
 */
export function AbroadTermsField({
  initial,
  visible,
  arrivalPoints,
  /** Platform Ghana VAT + levies, for the estimate's fallback. */
  defaultGhanaTaxRate,
  defaultDutyPercent,
  /** The listed price, so the estimate is about this product and not a guess. */
  price,
  /** Per-unit CBM and weight, for the freight legs in the estimate. */
  cbm,
  weightKg,
  partialPaymentEnabled,
}: {
  initial: AbroadTerms | null;
  visible: boolean;
  arrivalPoints: ArrivalPointConfig[];
  defaultGhanaTaxRate: number;
  defaultDutyPercent: number;
  price: number;
  cbm: number;
  weightKg: number;
  partialPaymentEnabled: boolean;
}) {
  const [terms, setTerms] = useState<AbroadTerms>(initial ?? EMPTY_ABROAD_TERMS);

  const set = <K extends keyof AbroadTerms>(key: K, value: AbroadTerms[K]) =>
    setTerms((prev) => ({ ...prev, [key]: value }));

  const serialised = visible ? (serialiseAbroadTerms(terms) ?? "") : "";

  const point = arrivalPoints.find((p) => p.id === terms.arrivalPointId) ?? null;
  const rate = point ? resolveArrivalRate(point, terms.originCountry, terms.freightMode) : null;

  // One unit, landed. Deliberately excludes leg 3 — the domestic leg depends on
  // which pickup point the buyer picks, which the seller cannot know.
  const estimate = useMemo(
    () =>
      priceAbroadLine({
        unitPrice: price || 0,
        quantity: 1,
        cbm: cbm || 0,
        weightKg: weightKg || 0,
        terms,
        rate,
        dutyPercent: point?.dutyPercent ?? defaultDutyPercent,
        clearingFee: point?.clearingFee ?? 0,
        defaultGhanaTaxRate,
        domesticFreight: 0,
      }),
    [price, cbm, weightKg, terms, rate, point, defaultGhanaTaxRate, defaultDutyPercent],
  );

  const allIn = terms.freightBasis === "all_in";
  const badUrl = terms.sourceUrl.trim().length > 0 && !isSafeSourceUrl(terms.sourceUrl);

  return (
    <>
      <input type="hidden" name="abroadTerms" value={serialised} />

      {visible ? (
        <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <div className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-niki-orange" />
            <h2 className="font-display text-lg font-bold text-niki-ink">Shipped from abroad</h2>
          </div>
          <p className="mt-1 text-sm text-niki-ink/65">
            Where you are sourcing it, how it reaches Ghana, and what the buyer pays for each leg.
            All of this is shown on the product page and again at checkout, where the buyer has to
            accept it before paying. Ordering never closes — buyers can order at any time.
          </p>

          {/* --- Sourcing ---------------------------------------------------- */}
          <Section icon={Link2} title="Where you are sourcing it">
            <Field
              label="Supplier link"
              htmlFor="abroadSourceUrl"
              hint={
                badUrl
                  ? "That doesn't look like a web address. Paste the full link, starting with https://"
                  : "The Alibaba, 1688, Amazon or other listing you are buying from. Buyers don't see the price there — only that you named a source."
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

            <Field
              label="Country of purchase"
              htmlFor="abroadOrigin"
              hint="Sets the freight rate, the arrival estimate, and which origin buyers find this under."
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

            {!terms.originCountry ? (
              // A Ghanaian shop dropshipping from Guangzhou that leaves this
              // blank inherits "Ghana", and the listing then belongs to no
              // origin at all: it never appears under Shop by origin, and the
              // freight table has nothing to rate it against.
              <p className="rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900">
                Set the country you are buying from unless your shop itself is
                registered there. Left blank, this listing inherits your shop&apos;s country — so a
                Ghana-registered shop&apos;s imported item won&apos;t show up under any origin, and
                its freight can&apos;t be rated.
              </p>
            ) : null}
          </Section>

          {/* --- Freight ----------------------------------------------------- */}
          <Section icon={Globe2} title="How it reaches Ghana">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Freight method"
                htmlFor="abroadMode"
                hint={FREIGHT_MODE_HINTS[terms.freightMode]}
              >
                <select
                  id="abroadMode"
                  value={terms.freightMode}
                  onChange={(e) => set("freightMode", e.target.value as FreightMode)}
                  className={inputClass}
                >
                  {FREIGHT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {FREIGHT_MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Ghana arrival point"
                htmlFor="abroadPoint"
                hint={
                  arrivalPoints.length === 0
                    ? "No arrival points are configured yet — ask an admin to add one."
                    : "Where the consignment lands. Each point has its own freight rate, duty and clearing charge."
                }
              >
                <select
                  id="abroadPoint"
                  value={terms.arrivalPointId}
                  onChange={(e) => set("arrivalPointId", e.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose…</option>
                  {arrivalPoints.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.city ? `${p.name} — ${p.city}` : p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {terms.arrivalPointId && !rate && !allIn && terms.intlFreight <= 0 && !terms.freightIncluded ? (
              <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
                No freight rate is configured for {terms.originCountry || "this origin"} by{" "}
                {FREIGHT_MODE_LABELS[terms.freightMode].toLowerCase()} into that point. Buyers
                can&apos;t be quoted for it — pick another route, enter your own leg-2 cost below, or
                ask an admin to add the rate.
              </p>
            ) : null}

            <label className="flex items-start gap-3 rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge">
              <input
                type="checkbox"
                checked={terms.freightIncluded}
                onChange={(e) => set("freightIncluded", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded"
              />
              <span className="text-sm text-niki-ink/80">
                <span className="font-medium text-niki-ink">
                  My price already includes freight into Ghana.
                </span>{" "}
                Tick this when the supplier quoted you a delivered-to-Ghana price. Legs 1 and 2 are
                then charged at zero — the buyer has already paid them inside your price — but the
                arrival point still matters, because the domestic leg starts there.
              </span>
            </label>

            {!terms.freightIncluded ? (
              <>
                <Field
                  label="How your forwarder charges you"
                  htmlFor="abroadBasis"
                  hint={
                    allIn
                      ? "One figure covering carriage, duty and clearing to the Ghana arrival point. Nothing is added on top of it."
                      : "Carriage comes from the arrival point's rate table; duty, clearing and Ghana VAT are added separately."
                  }
                >
                  <select
                    id="abroadBasis"
                    value={terms.freightBasis}
                    onChange={(e) => set("freightBasis", e.target.value as FreightBasis)}
                    className={inputClass}
                  >
                    <option value="itemised">
                      Itemised — carriage, then duty and clearing on top
                    </option>
                    <option value="all_in">
                      All-in — one combined fee to the Ghana arrival point
                    </option>
                  </select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Leg 1 — supplier to forwarder (GH₵ per unit)"
                    htmlFor="abroadLeg1"
                    hint="What it costs to get one unit from the supplier to your freight forwarder abroad. Charged separately on either basis."
                  >
                    <input
                      id="abroadLeg1"
                      type="number"
                      min={0}
                      step="0.01"
                      value={terms.supplierFreight || ""}
                      onChange={(e) => set("supplierFreight", Number(e.target.value) || 0)}
                      className={inputClass}
                    />
                  </Field>
                  <Field
                    label={
                      allIn
                        ? "All-in freight to Ghana (GH₵ per unit)"
                        : "Leg 2 override (GH₵ per unit)"
                    }
                    htmlFor="abroadLeg2"
                    hint={
                      allIn
                        ? "Your forwarder's single combined figure — carriage, duty and clearing. Required on this basis."
                        : "Leave at 0 to use the arrival point's own rate. Set a figure only if you have your own forwarder deal."
                    }
                  >
                    <input
                      id="abroadLeg2"
                      type="number"
                      min={0}
                      step="0.01"
                      value={terms.intlFreight || ""}
                      onChange={(e) => set("intlFreight", Number(e.target.value) || 0)}
                      className={inputClass}
                    />
                  </Field>
                </div>

                {allIn && terms.intlFreight <= 0 ? (
                  <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
                    An all-in listing needs your forwarder&apos;s combined figure. Without it the
                    freight into Ghana would be charged at zero.
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
                hint="How long the supplier needs before the goods reach your forwarder."
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
          </Section>

          {/* --- Tax --------------------------------------------------------- */}
          <Section icon={Receipt} title="Tax">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Tax at source (%)"
                htmlFor="abroadOriginTax"
                hint="Sales tax or VAT charged in the country you buy from. 0 if the supplier quotes tax-free export prices."
              >
                <input
                  id="abroadOriginTax"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={terms.originTaxRate || ""}
                  onChange={(e) => set("originTaxRate", Number(e.target.value) || 0)}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Ghana VAT & levies (%)"
                htmlFor="abroadGhanaTax"
                hint={
                  allIn
                    ? "Not charged on the all-in basis — your forwarder's figure already covers it."
                    : `Leave blank to use the platform rate of ${defaultGhanaTaxRate}%.`
                }
              >
                <input
                  id="abroadGhanaTax"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={terms.ghanaTaxRate >= 0 ? terms.ghanaTaxRate : ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    set("ghanaTaxRate", raw === "" ? -1 : Number(raw) || 0);
                  }}
                  className={inputClass}
                />
              </Field>
            </div>

            {allIn ? (
              <p className="rounded-xl bg-niki-surface p-4 text-sm text-niki-ink/70 ring-1 ring-niki-edge">
                Your all-in freight figure already covers import duty, clearing and the taxes
                assessed on landing, so none of them is charged again. Only the tax at source above
                still applies.
              </p>
            ) : (
              <label className="flex items-start gap-3 rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge">
                <input
                  type="checkbox"
                  checked={terms.dutyIncluded}
                  onChange={(e) => set("dutyIncluded", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded"
                />
                <span className="text-sm text-niki-ink/80">
                  Duty and clearing are already covered — don&apos;t charge them again. Tick this
                  only when your forwarder quoted you a duty-paid, cleared price.
                </span>
              </label>
            )}
          </Section>

          {/* --- Money ------------------------------------------------------- */}
          <Section icon={Wallet} title="How the buyer pays">
            <div className="rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge">
              <label className="flex items-center gap-2 text-sm font-medium text-niki-ink">
                <input
                  type="checkbox"
                  checked={terms.depositRequired}
                  onChange={(e) => set("depositRequired", e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                Take a deposit at checkout instead of the full item price
              </label>

              {terms.depositRequired ? (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Deposit type" htmlFor="abroadDepositType">
                    <select
                      id="abroadDepositType"
                      value={terms.depositType}
                      onChange={(e) =>
                        set("depositType", e.target.value === "fixed_amount" ? "fixed_amount" : "percentage")
                      }
                      className={inputClass}
                    >
                      <option value="percentage">Percentage of the price</option>
                      <option value="fixed_amount">Fixed amount (GH₵)</option>
                    </select>
                  </Field>
                  <Field
                    label={terms.depositType === "percentage" ? "Deposit (%)" : "Deposit (GH₵)"}
                    htmlFor="abroadDepositValue"
                    hint="A deposit of zero is treated as no deposit."
                  >
                    <input
                      id="abroadDepositValue"
                      type="number"
                      min={0}
                      step="0.01"
                      value={terms.depositValue || ""}
                      onChange={(e) => set("depositValue", Number(e.target.value) || 0)}
                      className={inputClass}
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            {partialPaymentEnabled ? (
              <label className="flex items-start gap-3 rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge">
                <input
                  type="checkbox"
                  checked={terms.allowFreightOnArrival}
                  onChange={(e) => set("allowFreightOnArrival", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded"
                />
                <span className="text-sm text-niki-ink/80">
                  <span className="font-medium text-niki-ink">
                    Let buyers pay for the goods now and settle the freight on arrival.
                  </span>{" "}
                  They pay the item price, the tax at source and leg 1 today, and the freight into
                  Ghana, duty, Ghana tax and the domestic leg when it lands — at whatever those cost
                  then. Buyers are told that plainly before they choose it.
                </span>
              </label>
            ) : null}

            <Field
              label="How the balance is paid"
              htmlFor="abroadBalance"
              hint="Shown when you take a deposit or allow payment on arrival."
            >
              <textarea
                id="abroadBalance"
                rows={2}
                value={terms.balanceInstruction}
                onChange={(e) => set("balanceInstruction", e.target.value)}
                placeholder="Balance due when the item lands in Accra, before collection."
                className={inputClass}
              />
            </Field>

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
          </Section>

          {/* --- The estimate ------------------------------------------------ */}
          <div className="mt-6 rounded-2xl bg-niki-black p-5 text-white">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-niki-orange" />
              <h3 className="font-display text-base font-bold">What one unit lands at</h3>
            </div>
            <p className="mt-1 text-xs text-white/60">
              Everything except the domestic leg, which depends on the pickup point the buyer picks.
            </p>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Row label="Item price" value={estimate.goods} />
              <Row label="Tax at source" value={estimate.originTax} />
              <Row label="Leg 1 — supplier to forwarder" value={estimate.supplierFreight} />
              <Row
                label={allIn ? "Freight to Ghana (all-in)" : "Leg 2 — forwarder to Ghana"}
                value={estimate.internationalFreight}
              />
              <Row label="Import duty" value={estimate.importDuty} />
              <Row label="Clearing & handling" value={estimate.clearingFee} />
              <Row label="Ghana VAT & levies" value={estimate.ghanaTax} />
              <div className="flex justify-between border-t border-white/15 pt-2 font-bold">
                <dt>Lands at</dt>
                <dd className="font-figures text-niki-orange">{formatPrice(estimate.total)}</dd>
              </div>
            </dl>
            {estimate.total > (price || 0) * 1.5 && price > 0 ? (
              <p className="mt-3 rounded-xl bg-white/10 p-3 text-xs text-white/80">
                The landed cost is more than half again your listed price. That is normal for bulky
                sea freight and a warning sign for anything small — check the CBM and weight above.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Plane;
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
  // A zero leg is still shown. "Leg 2: free" is information — it tells a seller
  // their freight-included tick took effect — where a missing row reads as a
  // charge they forgot to think about.
  return (
    <div className="flex justify-between gap-3 text-white/75">
      <dt>{label}</dt>
      <dd className="shrink-0 font-medium text-white">{value === 0 ? "—" : formatPrice(value)}</dd>
    </div>
  );
}
