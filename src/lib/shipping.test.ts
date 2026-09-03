import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billableWeightKg,
  clampToMoq,
  currencyRatesFrom,
  describeTransit,
  priceLine,
  quoteConsignments,
  quoteShipment,
  resolveForwarderRate,
  resolveGoodsClass,
  resolveRoute,
  resolveRouteRate,
  resolveRule,
  SHIPPING_DEFAULTS,
  type ConsolidationPoint,
  type Currency,
  type Forwarder,
  type ForwarderRoute,
  type ShipmentLine,
  type ShippingConfig,
  type ShippingRule,
} from "./shipping.ts";

/**
 * The properties worth pinning down are the ones that would quietly overcharge
 * or undercharge somebody: that a second unit does not pay a second base fee,
 * that a second *seller* does, the free-at-origin rule, which arrangement adds
 * an international leg and which does not, that a dollar rate is converted
 * exactly once, and the double-charging an all-in forwarder rate invites.
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

const NORMAL = {
  id: "gc-normal",
  name: "Normal Goods",
  note: "",
  surchargePerCbm: 0,
  surchargeLabel: "",
  sortOrder: 0,
  isDefault: true,
};

const HEAVY = {
  id: "gc-heavy",
  name: "Heavy-Duty Goods",
  note: "",
  surchargePerCbm: 0,
  surchargeLabel: "",
  sortOrder: 2,
  isDefault: false,
};

/** Appliances: normal goods, plus an energy-commission levy per cubic metre. */
const APPLIANCE = {
  id: "gc-appliance",
  name: "Appliances",
  note: "",
  surchargePerCbm: 10,
  surchargeLabel: "Energy commission",
  sortOrder: 1,
  isDefault: false,
};

const SEA_ACCRA: ForwarderRoute = {
  id: "rt-sea-accra",
  forwarderId: "fw-gz",
  name: "China → Accra (Sea)",
  originCountry: "CN",
  originCity: "Guangzhou",
  mode: "sea",
  destinationPointId: TEMA.id,
  currency: "USD",
  minDays: 35,
  maxDays: 45,
  note: "",
  isActive: true,
  isDefault: true,
  rates: [
    { id: "rr-sea-normal", goodsClassId: NORMAL.id, ratePerCbm: 260, ratePerKg: 0, minCharge: 0, minCbm: 1, note: "" },
    { id: "rr-sea-heavy", goodsClassId: HEAVY.id, ratePerCbm: 300, ratePerKg: 0, minCharge: 0, minCbm: 1, note: "" },
    { id: "rr-sea-appl", goodsClassId: APPLIANCE.id, ratePerCbm: 260, ratePerKg: 0, minCharge: 0, minCbm: 1, note: "" },
    { id: "rr-sea-any", goodsClassId: null, ratePerCbm: 280, ratePerKg: 0, minCharge: 0, minCbm: 1, note: "" },
  ],
};

const AIR_ACCRA: ForwarderRoute = {
  id: "rt-air-accra",
  forwarderId: "fw-gz",
  name: "China → Accra (Air)",
  originCountry: "CN",
  originCity: "Guangzhou",
  mode: "air",
  destinationPointId: TEMA.id,
  currency: "USD",
  minDays: 7,
  maxDays: 14,
  note: "",
  isActive: true,
  isDefault: false,
  rates: [{ id: "rr-air-any", goodsClassId: null, ratePerCbm: 0, ratePerKg: 12, minCharge: 0, minCbm: 0, note: "" }],
};

const FORWARDER: Forwarder = {
  id: "fw-gz",
  name: "Guangzhou Consolidators",
  code: "GZC",
  originCountry: "CN",
  mode: "sea",
  consolidationPointId: TEMA.id,
  currency: "USD",
  allInclusive: true,
  note: "",
  terms: "",
  isActive: true,
  goodsClasses: [NORMAL, APPLIANCE, HEAVY],
  categoryMap: { "cat-home": NORMAL.id, "cat-appliances": APPLIANCE.id, "cat-machinery": HEAVY.id },
  routes: [SEA_ACCRA, AIR_ACCRA],
  rates: [],
};

/** A forwarder still on the old flat list: no routes, one price per category. */
const LEGACY_FORWARDER: Forwarder = {
  ...FORWARDER,
  id: "fw-legacy",
  currency: "GHS",
  goodsClasses: [],
  categoryMap: {},
  routes: [],
  rates: [
    { id: "r1", categoryId: null, label: "General", ratePerCbm: 3000, ratePerKg: 0, minCharge: 0, transitDays: 35 },
    { id: "r2", categoryId: "cat-electronics", label: "Electronics", ratePerCbm: 4500, ratePerKg: 0, minCharge: 0, transitDays: 35 },
  ],
};

const CURRENCIES: Currency[] = [
  { code: "GHS", name: "Ghana Cedi", symbol: "GH₵", rateToGhs: 1, isActive: true },
  { code: "USD", name: "US Dollar", symbol: "$", rateToGhs: 12, isActive: true },
];

const CONFIG: ShippingConfig = {
  defaults: { ...SHIPPING_DEFAULTS, baseFee: 10, perUnitFee: 1.5, perKgRate: 0, minFee: 0, fallbackRatePerCbm: 0 },
  rules: [],
  currencies: currencyRatesFrom(CURRENCIES),
};

function line(over: Partial<ShipmentLine> = {}): ShipmentLine {
  return {
    vendorId: "v-1",
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

/** The whole-cart shipping figure — the only number a buyer ever sees. */
function cartFee(lines: ShipmentLine[], dest: string, config = CONFIG): number {
  return quoteShipment(lines, dest, config).quote.fee;
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
  assert.equal(cartFee([line()], "pp-kumasi"), 0);
});

test("collecting anywhere else costs the base fee", () => {
  assert.equal(cartFee([line()], "pp-accra"), 10);
});

// --- The reason this model exists ------------------------------------------

test("a second unit adds the increment, not a second base fee", () => {
  // The bug this replaces: one bottle of spray at GH₵10 shipping meant ten
  // bottles at GH₵100, for one parcel on one van.
  assert.equal(cartFee([line({ quantity: 1 })], "pp-accra"), 10);
  assert.equal(cartFee([line({ quantity: 10 })], "pp-accra"), 10 + 1.5 * 9);
});

test("two lines from one seller share a single base fee", () => {
  const fee = cartFee([line({ quantity: 2 }), line({ quantity: 3, categoryId: "cat-phones" })], "pp-accra");
  // One consignment: 5 units, one base fee, four increments.
  assert.equal(fee, 10 + 1.5 * 4);
});

test("two sellers are two consignments and two base fees", () => {
  const fee = cartFee([line({ vendorId: "v-1" }), line({ vendorId: "v-2" })], "pp-accra");
  assert.equal(fee, 20);
});

test("one seller gathering at two points is two consignments", () => {
  // Two loads, from two places, on two runs — one base fee would price a
  // journey nobody makes.
  const elsewhere: ConsolidationPoint = { ...KUMASI, id: "cp-accra", pickupPointId: "pp-adenta" };
  assert.equal(cartFee([line(), line({ point: elsewhere })], "pp-accra"), 20);
});

test("the base fee is the dearest in the consignment, charged once", () => {
  const rules: ShippingRule[] = [
    {
      id: "fridges",
      originPointId: null,
      destPickupId: null,
      categoryId: "cat-appliances",
      baseFee: 60,
      perUnitFee: 20,
      flatFee: 0,
      perKgRate: 0,
      note: "",
      isActive: true,
    },
  ];
  const config: ShippingConfig = { ...CONFIG, rules };
  // A fridge and a phone case in one handover: the fridge sets the base, and
  // the case adds its own small increment rather than riding free.
  const fee = cartFee([line({ categoryId: "cat-appliances" }), line({ categoryId: "cat-phones" })], "pp-accra", config);
  assert.equal(fee, 60 + 1.5);
});

test("the per-line split adds back up to the consignment fee", () => {
  const lines = [line({ quantity: 2 }), line({ quantity: 3, categoryId: "cat-phones" })];
  const { consignments, perLineLocal } = quoteConsignments(lines, "pp-accra", CONFIG);
  assert.equal(consignments.length, 1);
  assert.equal(perLineLocal.reduce((a, b) => a + b, 0), consignments[0].fee);
});

// --- Manual and free --------------------------------------------------------

test("a special shipment charges exactly what was quoted, times the quantity", () => {
  const lines = [line({ method: "manual", manualFee: 1200, quantity: 2 })];
  assert.equal(cartFee(lines, "pp-accra"), 2400);
  // And it stays outside the consignment, so it never inherits a base fee.
  assert.equal(quoteShipment(lines, "pp-accra", CONFIG).perLine[0].localFreight, 0);
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
  { id: "any", originPointId: null, destPickupId: null, categoryId: null, baseFee: 10, perUnitFee: 2, flatFee: 0, perKgRate: 0, note: "", isActive: true },
  { id: "blenders", originPointId: KUMASI.id, destPickupId: "pp-accra", categoryId: "cat-home", baseFee: 50, perUnitFee: 5, flatFee: 0, perKgRate: 0, note: "", isActive: true },
  { id: "route", originPointId: KUMASI.id, destPickupId: "pp-accra", categoryId: null, baseFee: 25, perUnitFee: 3, flatFee: 0, perKgRate: 0, note: "", isActive: true },
];

test("the most specific rule wins", () => {
  const scope = { originPointId: KUMASI.id, destPickupId: "pp-accra", categoryId: "cat-home" };
  assert.equal(resolveRule(RULES, scope)?.id, "blenders");
  assert.equal(resolveRule(RULES, { ...scope, categoryId: "cat-phones" })?.id, "route");
  assert.equal(resolveRule(RULES, { ...scope, destPickupId: "pp-tamale" })?.id, "any");
});

test("an inactive rule is not consulted", () => {
  const off = RULES.map((r) => (r.id === "blenders" ? { ...r, isActive: false } : r));
  assert.equal(
    resolveRule(off, { originPointId: KUMASI.id, destPickupId: "pp-accra", categoryId: "cat-home" })?.id,
    "route",
  );
});

test("a legacy flat rule becomes the base fee and stops multiplying", () => {
  // Written under the old system as "GH₵50 per item"; three items used to cost
  // GH₵150 for one parcel. It is now the consignment's base fee, and the
  // increment is derived from the weight rate on the same rule.
  const legacy: ShippingRule[] = [
    { id: "legacy", originPointId: null, destPickupId: null, categoryId: null, baseFee: 0, perUnitFee: 0, flatFee: 50, perKgRate: 4, note: "", isActive: true },
  ];
  const config: ShippingConfig = { ...CONFIG, rules: legacy };
  // 50 base + 2 extra units × (GH₵4 × 2 kg billable).
  assert.equal(cartFee([line({ quantity: 3 })], "pp-accra", config), 50 + 16);
});

// --- Minimum order quantity -------------------------------------------------

test("a quantity below the minimum is raised to it", () => {
  assert.equal(clampToMoq(1, 12), 12);
  assert.equal(clampToMoq(20, 12), 20);
  assert.equal(clampToMoq(0, 1), 1);
  assert.equal(clampToMoq(3, null), 3);
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
  assert.equal(priced.unpricedRoute, false);
  // Only the local run from Tema to the buyer's station, added by the cart.
  assert.equal(cartFee([line({ originCountry: "CN", supplierDelivers: true, point: TEMA })], "pp-accra"), 10);
});

test("a supplier who delivers into the buyer's own station charges nothing", () => {
  const lines = [line({ originCountry: "CN", supplierDelivers: true, point: TEMA, forwarder: null })];
  assert.equal(cartFee(lines, "pp-tema"), 0);
});

// --- Imported: routes, goods classes and currency ---------------------------

test("a category maps to the forwarder's own class, else their default", () => {
  assert.equal(resolveGoodsClass(FORWARDER, "cat-machinery")?.id, HEAVY.id);
  assert.equal(resolveGoodsClass(FORWARDER, "cat-nothing")?.id, NORMAL.id);
  assert.equal(resolveGoodsClass(null, "cat-home"), null);
});

test("a route rate for the class wins over the route's catch-all", () => {
  assert.equal(resolveRouteRate(SEA_ACCRA, HEAVY.id)?.ratePerCbm, 300);
  assert.equal(resolveRouteRate(SEA_ACCRA, "gc-unknown")?.ratePerCbm, 280);
  assert.equal(resolveRouteRate(null, NORMAL.id), null);
});

test("the default route is quoted until the buyer picks another", () => {
  assert.equal(resolveRoute(FORWARDER)?.id, SEA_ACCRA.id);
  assert.equal(resolveRoute(FORWARDER, AIR_ACCRA.id)?.id, AIR_ACCRA.id);
  // A route id that belongs to nobody is a claim from a browser, and loses.
  assert.equal(resolveRoute(FORWARDER, "rt-invented")?.id, SEA_ACCRA.id);
});

test("a dollar rate is converted to cedis exactly once", () => {
  const priced = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER }),
    "pp-accra",
    CONFIG,
  );
  // 0.05 CBM is under the route's 1 CBM minimum, so it bills as one: $260 → GH₵3,120.
  assert.equal(priced.internationalFreight, 3120);
});

test("correcting the exchange rate re-prices every route that uses it", () => {
  const config: ShippingConfig = {
    ...CONFIG,
    currencies: currencyRatesFrom([...CURRENCIES.slice(0, 1), { ...CURRENCIES[1], rateToGhs: 15 }]),
  };
  const priced = priceLine(line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER }), "pp-accra", config);
  assert.equal(priced.internationalFreight, 3900); // $260 × 15
});

test("a goods-class levy rides on the same cubic metres", () => {
  const priced = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER, categoryId: "cat-appliances", size: { cbm: 2 } }),
    "pp-accra",
    CONFIG,
  );
  // 2 CBM × ($260 + $10 energy commission) × 12.
  assert.equal(priced.internationalFreight, 2 * 270 * 12);
  assert.equal(priced.goodsClass?.id, APPLIANCE.id);
});

test("choosing air changes both the price and the promised window", () => {
  const air = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER, routeId: AIR_ACCRA.id }),
    "pp-accra",
    CONFIG,
  );
  assert.equal(air.internationalFreight, 12 * 2 * 12); // $12/kg × 2 kg × 12
  assert.equal(air.transitMinDays, 7);
  assert.equal(air.transitMaxDays, 14);
  assert.equal(describeTransit(air.transitMinDays, air.transitMaxDays), "7–14 days");
});

test("an all-inclusive forwarder rate is not dutied or taxed again", () => {
  const priced = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER, supplierFreight: 40 }),
    "pp-accra",
    CONFIG,
  );
  assert.equal(priced.supplierFreight, 40);
  assert.equal(priced.importDuty, 0);
  assert.equal(priced.clearingFee, 0);
  assert.equal(priced.tax, 0);
  assert.equal(priced.fee, 3120 + 40);
});

test("an itemised forwarder rate is dutied and taxed on the landed value", () => {
  const itemised: Forwarder = { ...LEGACY_FORWARDER, allInclusive: false };
  const priced = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: itemised, supplierFreight: 40, taxRate: 10 }),
    "pp-accra",
    CONFIG,
  );
  // Landed value: 400 goods + 40 leg 1 + 150 leg 2 (3000 × 0.05 CBM) = 590.
  assert.equal(priced.internationalFreight, 150);
  assert.equal(priced.importDuty, 118); // 20% of 590
  assert.equal(priced.clearingFee, 80);
  assert.equal(priced.tax, 70.8); // 10% of (590 + 118)
});

test("a forwarder still on the old flat list keeps quoting", () => {
  assert.equal(resolveForwarderRate(LEGACY_FORWARDER, "cat-electronics")?.ratePerCbm, 4500);
  assert.equal(resolveForwarderRate(LEGACY_FORWARDER, "cat-home")?.ratePerCbm, 3000);
  assert.equal(resolveForwarderRate(null, "cat-home"), null);
});

test("an unpriced route is reported rather than quoted at zero", () => {
  const bare: Forwarder = { ...FORWARDER, routes: [], rates: [] };
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
  const bare: Forwarder = { ...FORWARDER, routes: [], rates: [] };
  const { quote } = quoteShipment(
    [line(), line({ originCountry: "CN", point: TEMA, forwarder: bare, vendorId: "v-2" })],
    "pp-accra",
    CONFIG,
  );
  assert.equal(quote.unpricedRoute, true);
  assert.equal(quote.hasImported, true);
  assert.equal(quote.consignments.length, 2);
  assert.equal(quote.fee, 20); // two consignments, one base fee each
});

test("a cart entirely at the buyer's own station is free", () => {
  const { quote } = quoteShipment([line(), line({ quantity: 2 })], "pp-kumasi", CONFIG);
  assert.equal(quote.fee, 0);
  assert.equal(quote.allCollectedAtOrigin, true);
});
