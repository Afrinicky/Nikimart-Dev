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
  resolveGoodsClass,
  resolveRoute,
  resolveRouteRate,
  resolveRule,
  routesToPoint,
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
 * exactly once, and that a lane which will not carry a class says so instead of
 * quoting somebody else's price.
 */

const KUMASI: ConsolidationPoint = {
  id: "cp-kumasi",
  name: "Kumasi Depot",
  code: "KSI",
  city: "Kumasi",
  address: "",
  kind: "local",
  forwarderId: null,
  pickupPointId: "pp-kumasi",
  note: "",
  isActive: true,
};

/** The forwarder's own warehouse in Ghana. */
const TEMA: ConsolidationPoint = {
  id: "cp-tema",
  name: "Tema Depot",
  code: "TEMA",
  city: "Tema",
  address: "",
  kind: "international",
  forwarderId: "fw-gz",
  pickupPointId: "pp-tema",
  note: "",
  isActive: true,
};

const NORMAL = {
  id: "gc-normal",
  name: "Normal Goods",
  note: "",
  levyCbm: 0,
  levyLabel: "",
  sortOrder: 0,
  isDefault: true,
};

const HEAVY = {
  id: "gc-heavy",
  name: "Heavy-Duty Goods",
  note: "",
  levyCbm: 0,
  levyLabel: "",
  sortOrder: 2,
  isDefault: false,
};

/** A class that carries a special levy, charged as extra cubic metres. */
const APPLIANCE = {
  id: "gc-appliance",
  name: "Appliances",
  note: "",
  levyCbm: 0.01,
  levyLabel: "Energy commission",
  sortOrder: 1,
  isDefault: false,
};

/** The sea column of the forwarder's grid for their Tema warehouse. */
const SEA: ForwarderRoute = {
  id: "rt-sea",
  forwarderId: "fw-gz",
  name: "",
  mode: "sea",
  destinationPointId: TEMA.id,
  currency: "USD",
  minDays: 35,
  maxDays: 45,
  minCbm: 0.2,
  orderFrequency: "weekly",
  orderFrequencyDetail: "",
  note: "",
  isActive: true,
  isDefault: true,
  rates: [
    { id: "rr-sea-normal", goodsClassId: NORMAL.id, ratePerCbm: 260, isAvailable: true, note: "" },
    { id: "rr-sea-heavy", goodsClassId: HEAVY.id, ratePerCbm: 300, isAvailable: true, note: "" },
    { id: "rr-sea-appl", goodsClassId: APPLIANCE.id, ratePerCbm: 260, isAvailable: true, note: "" },
    { id: "rr-sea-any", goodsClassId: null, ratePerCbm: 280, isAvailable: true, note: "" },
  ],
};

/** The air column: it takes normal goods and refuses everything heavy. */
const AIR: ForwarderRoute = {
  id: "rt-air",
  forwarderId: "fw-gz",
  name: "",
  mode: "air",
  destinationPointId: TEMA.id,
  currency: "USD",
  minDays: 7,
  maxDays: 14,
  minCbm: 0,
  orderFrequency: "",
  orderFrequencyDetail: "",
  note: "",
  isActive: true,
  isDefault: false,
  rates: [
    { id: "rr-air-normal", goodsClassId: NORMAL.id, ratePerCbm: 900, isAvailable: true, note: "" },
    { id: "rr-air-heavy", goodsClassId: HEAVY.id, ratePerCbm: 0, isAvailable: false, note: "" },
  ],
};

const FORWARDER: Forwarder = {
  id: "fw-gz",
  name: "Guangzhou Consolidators",
  code: "GZC",
  ghanaAddress: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  originCountry: "CN",
  collectionAddress: "",
  collectionCity: "Guangzhou",
  currency: "USD",
  note: "",
  terms: "",
  isActive: true,
  consolidations: [TEMA],
  goodsClasses: [NORMAL, APPLIANCE, HEAVY],
  categoryMap: { "cat-home": NORMAL.id, "cat-appliances": APPLIANCE.id, "cat-machinery": HEAVY.id },
  routes: [SEA, AIR],
};

const CURRENCIES: Currency[] = [
  { code: "GHS", name: "Ghana Cedi", symbol: "GH₵", rateToGhs: 1, isActive: true, autoUpdate: false, source: "" },
  { code: "USD", name: "US Dollar", symbol: "$", rateToGhs: 12, isActive: true, autoUpdate: true, source: "" },
];

const CONFIG: ShippingConfig = {
  defaults: { ...SHIPPING_DEFAULTS, baseFee: 10, perUnitFee: 1.5, perKgRate: 0, minFee: 0 },
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

test("a cell for the class wins over the lane's catch-all", () => {
  assert.equal(resolveRouteRate(SEA, HEAVY.id)?.ratePerCbm, 300);
  assert.equal(resolveRouteRate(SEA, "gc-unknown")?.ratePerCbm, 280);
  assert.equal(resolveRouteRate(null, NORMAL.id), null);
});

test("the default lane is quoted when the listing names none", () => {
  assert.equal(resolveRoute(FORWARDER)?.id, SEA.id);
  assert.equal(resolveRoute(FORWARDER, AIR.id)?.id, AIR.id);
  // A route id that belongs to nobody is a claim from a browser, and loses.
  assert.equal(resolveRoute(FORWARDER, "rt-invented")?.id, SEA.id);
});

test("only the lanes into a given warehouse are offered for it", () => {
  assert.deepEqual(
    routesToPoint(FORWARDER, TEMA.id).map((r) => r.id),
    [SEA.id, AIR.id],
  );
  assert.deepEqual(routesToPoint(FORWARDER, "cp-elsewhere"), []);
  assert.deepEqual(routesToPoint(FORWARDER, null), []);
});

test("a dollar rate is converted to cedis exactly once", () => {
  const priced = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER }),
    "pp-accra",
    CONFIG,
  );
  // 0.05 CBM × $260 × 12 = GH₵156. The forwarder's rate is the whole leg.
  assert.equal(priced.internationalFreight, 156);
});

test("correcting the exchange rate re-prices every route that uses it", () => {
  const config: ShippingConfig = {
    ...CONFIG,
    currencies: currencyRatesFrom([...CURRENCIES.slice(0, 1), { ...CURRENCIES[1], rateToGhs: 15 }]),
  };
  const priced = priceLine(line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER }), "pp-accra", config);
  assert.equal(priced.internationalFreight, 195); // 0.05 × $260 × 15
});

test("a class levy is charged as extra cubic metres, not a second price", () => {
  const priced = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER, categoryId: "cat-appliances", size: { cbm: 2 } }),
    "pp-accra",
    CONFIG,
  );
  // (2 + 0.01 levy) CBM × $260 × 12, rounded to the pesewa.
  assert.equal(priced.internationalFreight, 6271.2);
  assert.equal(priced.goodsClass?.id, APPLIANCE.id);
});

test("a different mode is a different price and a different window", () => {
  const air = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER, routeId: AIR.id }),
    "pp-accra",
    CONFIG,
  );
  assert.equal(air.internationalFreight, 0.05 * 900 * 12);
  assert.equal(air.transitMinDays, 7);
  assert.equal(air.transitMaxDays, 14);
  assert.equal(describeTransit(air.transitMinDays, air.transitMaxDays), "7–14 days");
});

test("the forwarder's rate is the whole leg — nothing is added to it", () => {
  const priced = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER, supplierFreight: 40 }),
    "pp-accra",
    CONFIG,
  );
  assert.equal(priced.supplierFreight, 40);
  // Leg 1 plus leg 2, and no duty, clearing or tax on top of either.
  assert.equal(priced.fee, 156 + 40);
});

test("a lane that will not carry a class refuses it rather than pricing it", () => {
  // Heavy-duty goods by air: the cell is marked N/A, and the catch-all row for
  // another class must not stand in for it.
  const priced = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER, routeId: AIR.id, categoryId: "cat-machinery" }),
    "pp-accra",
    CONFIG,
  );
  assert.equal(priced.unpricedRoute, true);
  assert.equal(priced.internationalFreight, 0);
});

test("an unpriced lane is reported rather than quoted at zero", () => {
  const bare: Forwarder = { ...FORWARDER, routes: [] };
  const priced = priceLine(line({ originCountry: "CN", point: TEMA, forwarder: bare }), "pp-accra", CONFIG);
  assert.equal(priced.unpricedRoute, true);
  assert.equal(priced.internationalFreight, 0);
});

test("an imported listing with no forwarder at all cannot be quoted", () => {
  const priced = priceLine(line({ originCountry: "CN", point: TEMA, forwarder: null }), "pp-accra", CONFIG);
  assert.equal(priced.unpricedRoute, true);
  assert.equal(priced.internationalFreight, 0);
});

// --- The whole cart ---------------------------------------------------------

test("a cart adds its lines up and carries the unpriced flag", () => {
  const bare: Forwarder = { ...FORWARDER, routes: [] };
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
