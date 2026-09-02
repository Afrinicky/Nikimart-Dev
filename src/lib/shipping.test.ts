import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billableWeightKg,
  localLegFee,
  priceLine,
  quoteShipment,
  resolveForwarderRate,
  resolveRule,
  SHIPPING_DEFAULTS,
  type ConsolidationPoint,
  type Forwarder,
  type ShipmentLine,
  type ShippingConfig,
  type ShippingRule,
} from "./shipping.ts";

/**
 * The properties worth pinning down are the ones that would quietly overcharge
 * or undercharge somebody: the free-at-origin rule, which arrangement adds an
 * international leg and which does not, and the double-charging an all-in
 * forwarder rate invites.
 */

const KUMASI: ConsolidationPoint = {
  id: "cp-kumasi",
  name: "Kumasi Depot",
  code: "KSI",
  city: "Kumasi",
  kind: "local",
  pickupPointId: "pp-kumasi",
  dutyPercent: 0,
  clearingFee: 0,
  note: "",
  isActive: true,
};

const TEMA: ConsolidationPoint = {
  id: "cp-tema",
  name: "Tema Port",
  code: "TEMA",
  city: "Tema",
  kind: "international",
  pickupPointId: "pp-tema",
  dutyPercent: 20,
  clearingFee: 80,
  note: "",
  isActive: true,
};

const FORWARDER: Forwarder = {
  id: "fw-gz",
  name: "Guangzhou Consolidators",
  code: "GZC",
  originCountry: "CN",
  mode: "sea",
  consolidationPointId: TEMA.id,
  allInclusive: true,
  note: "",
  isActive: true,
  rates: [
    { id: "r1", categoryId: null, label: "General", ratePerCbm: 3000, ratePerKg: 0, minCharge: 0, transitDays: 35 },
    { id: "r2", categoryId: "cat-electronics", label: "Electronics", ratePerCbm: 4500, ratePerKg: 0, minCharge: 0, transitDays: 35 },
  ],
};

const CONFIG: ShippingConfig = {
  defaults: { ...SHIPPING_DEFAULTS, baseFee: 15, perKgRate: 4, minFee: 0, fallbackRatePerCbm: 0 },
  rules: [],
};

function line(over: Partial<ShipmentLine> = {}): ShipmentLine {
  return {
    quantity: 1,
    unitPrice: 400,
    size: { shippingWeightKg: 2, lengthCm: 0, widthCm: 0, heightCm: 0, cbm: 0.05 },
    categoryId: "cat-home",
    method: "auto",
    manualFee: 0,
    originCountry: "GH",
    point: KUMASI,
    forwarder: null,
    supplierDelivers: false,
    supplierFreight: 0,
    originTaxRate: 0,
    taxRate: -1,
    dutyIncluded: false,
    ...over,
  };
}

// --- Billable weight --------------------------------------------------------

test("billable weight takes the greater of actual and volumetric, rounded up", () => {
  // 40×30×20 cm ÷ 5000 = 4.8 volumetric kg, against 2 kg on the scales.
  assert.equal(billableWeightKg({ shippingWeightKg: 2, lengthCm: 40, widthCm: 30, heightCm: 20 }), 5);
  // A dense parcel keeps its actual weight, rounded up to the next half kilo.
  assert.equal(billableWeightKg({ shippingWeightKg: 2.6, lengthCm: 10, widthCm: 10, heightCm: 10 }), 3);
  // Nothing recorded at all still bills at something.
  assert.equal(billableWeightKg({}), 0.5);
});

// --- The free-at-origin rule ------------------------------------------------

test("collecting where the goods already are costs nothing", () => {
  const priced = priceLine(line(), "pp-kumasi", CONFIG);
  assert.equal(priced.fee, 0);
  assert.equal(priced.collectedAtOrigin, true);
});

test("collecting anywhere else is priced on billable weight", () => {
  const priced = priceLine(line(), "pp-accra", CONFIG);
  // 15 base + 4 × 2 kg.
  assert.equal(priced.fee, 23);
  assert.equal(priced.localFreight, 23);
  assert.equal(priced.collectedAtOrigin, false);
});

// --- Manual and free --------------------------------------------------------

test("a special shipment charges exactly what was quoted, times the quantity", () => {
  const priced = priceLine(line({ method: "manual", manualFee: 1200, quantity: 2 }), "pp-accra", CONFIG);
  assert.equal(priced.fee, 2400);
  assert.equal(priced.localFreight, 0);
});

test("free shipping is free even from abroad", () => {
  const priced = priceLine(
    line({ method: "free", originCountry: "CN", forwarder: FORWARDER, point: TEMA }),
    "pp-accra",
    CONFIG,
  );
  assert.equal(priced.fee, 0);
  assert.equal(priced.unpricedRoute, false);
});

// --- Rules ------------------------------------------------------------------

const RULES: ShippingRule[] = [
  { id: "any", originPointId: null, destPickupId: null, categoryId: null, flatFee: 0, baseFee: 10, perKgRate: 3, note: "", isActive: true },
  { id: "blenders", originPointId: KUMASI.id, destPickupId: "pp-accra", categoryId: "cat-home", flatFee: 50, baseFee: 0, perKgRate: 0, note: "", isActive: true },
  { id: "route", originPointId: KUMASI.id, destPickupId: "pp-accra", categoryId: null, flatFee: 0, baseFee: 25, perKgRate: 2, note: "", isActive: true },
];

test("the most specific rule wins", () => {
  const scope = { originPointId: KUMASI.id, destPickupId: "pp-accra", categoryId: "cat-home" };
  assert.equal(resolveRule(RULES, scope)?.id, "blenders");
  assert.equal(resolveRule(RULES, { ...scope, categoryId: "cat-phones" })?.id, "route");
  assert.equal(resolveRule(RULES, { ...scope, destPickupId: "pp-tamale" })?.id, "any");
});

test("a flat group rule prices per item and ignores weight", () => {
  const config: ShippingConfig = { ...CONFIG, rules: RULES };
  const priced = priceLine(line({ quantity: 3 }), "pp-accra", config);
  assert.equal(priced.fee, 150);
});

test("an inactive rule is not consulted", () => {
  const off = RULES.map((r) => (r.id === "blenders" ? { ...r, isActive: false } : r));
  assert.equal(
    resolveRule(off, { originPointId: KUMASI.id, destPickupId: "pp-accra", categoryId: "cat-home" })?.id,
    "route",
  );
});

test("with no rule at all the platform defaults price it", () => {
  const { fee } = localLegFee(line({ quantity: 2 }), "pp-accra", CONFIG);
  // 15 base + 4 × (2 kg × 2 units).
  assert.equal(fee, 31);
});

// --- Imported: the supplier delivers ---------------------------------------

test("a supplier who delivers to Ghana adds no international charge", () => {
  const priced = priceLine(
    line({ originCountry: "CN", supplierDelivers: true, point: TEMA, forwarder: null }),
    "pp-accra",
    CONFIG,
  );
  assert.equal(priced.internationalFreight, 0);
  assert.equal(priced.importDuty, 0);
  assert.equal(priced.tax, 0);
  // Only the local run from Tema to the buyer's station.
  assert.equal(priced.fee, priced.localFreight);
  assert.equal(priced.unpricedRoute, false);
});

test("a supplier who delivers into the buyer's own station charges nothing", () => {
  const priced = priceLine(
    line({ originCountry: "CN", supplierDelivers: true, point: TEMA, forwarder: null }),
    "pp-tema",
    CONFIG,
  );
  assert.equal(priced.fee, 0);
});

// --- Imported: a forwarder carries it ---------------------------------------

test("a forwarder's category price wins over their catch-all", () => {
  assert.equal(resolveForwarderRate(FORWARDER, "cat-electronics")?.ratePerCbm, 4500);
  assert.equal(resolveForwarderRate(FORWARDER, "cat-home")?.ratePerCbm, 3000);
  assert.equal(resolveForwarderRate(null, "cat-home"), null);
});

test("an all-inclusive forwarder rate is not dutied or taxed again", () => {
  const priced = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER, supplierFreight: 40 }),
    "pp-accra",
    CONFIG,
  );
  assert.equal(priced.internationalFreight, 150); // 3000 × 0.05 CBM
  assert.equal(priced.supplierFreight, 40);
  assert.equal(priced.importDuty, 0);
  assert.equal(priced.clearingFee, 0);
  assert.equal(priced.tax, 0);
  assert.equal(priced.fee, 150 + 40 + priced.localFreight);
});

test("an itemised forwarder rate is dutied and taxed on the landed value", () => {
  const itemised: Forwarder = { ...FORWARDER, allInclusive: false };
  const priced = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: itemised, supplierFreight: 40, taxRate: 10 }),
    "pp-accra",
    CONFIG,
  );
  // Landed value: 400 goods + 40 leg 1 + 150 leg 2 = 590.
  assert.equal(priced.importDuty, 118); // 20% of 590
  assert.equal(priced.clearingFee, 80);
  assert.equal(priced.tax, 70.8); // 10% of (590 + 118)
});

test("an unpriced route is reported rather than quoted at zero", () => {
  const bare: Forwarder = { ...FORWARDER, rates: [] };
  const priced = priceLine(line({ originCountry: "CN", point: TEMA, forwarder: bare }), "pp-accra", CONFIG);
  assert.equal(priced.unpricedRoute, true);
  assert.equal(priced.internationalFreight, 0);
});

test("the platform fallback rate prices a route no forwarder covers", () => {
  const config: ShippingConfig = {
    ...CONFIG,
    defaults: { ...CONFIG.defaults, fallbackRatePerCbm: 2000 },
  };
  const priced = priceLine(line({ originCountry: "CN", point: TEMA, forwarder: null }), "pp-accra", config);
  assert.equal(priced.unpricedRoute, false);
  assert.equal(priced.internationalFreight, 100); // 2000 × 0.05
});

// --- The whole cart ---------------------------------------------------------

test("a cart adds its lines up and carries the unpriced flag", () => {
  const bare: Forwarder = { ...FORWARDER, rates: [] };
  const { quote } = quoteShipment(
    [line(), line({ originCountry: "CN", point: TEMA, forwarder: bare })],
    "pp-accra",
    CONFIG,
  );
  assert.equal(quote.unpricedRoute, true);
  assert.equal(quote.hasImported, true);
  assert.equal(quote.fee, 46); // two local legs at 23
});

test("a cart entirely at the buyer's own station is free", () => {
  const { quote } = quoteShipment([line(), line({ quantity: 2 })], "pp-kumasi", CONFIG);
  assert.equal(quote.fee, 0);
  assert.equal(quote.allCollectedAtOrigin, true);
});
