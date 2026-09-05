import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billableWeightKg,
  clampToMoq,
  currencyRatesFrom,
  describeTransit,
  isLargeItem,
  LARGE_ITEM_DEFAULTS,
  priceLine,
  quoteConsignments,
  quoteShipment,
  resolveGoodsClasses,
  resolveLaneRate,
  resolveRoute,
  locationKeyForPickup,
  locationKeyForPoint,
  resolveLaneFee,
  routesToPoint,
  SHIPPING_DEFAULTS,
  type ConsolidationPoint,
  type Currency,
  type Forwarder,
  type ForwarderRoute,
  type LaneFee,
  type ShipmentLine,
  type ShippingConfig,
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
  sortOrder: 0,
  isDefault: true,
};

const HEAVY = {
  id: "gc-heavy",
  name: "Heavy-Duty Goods",
  note: "",
  sortOrder: 2,
  isDefault: false,
};

/**
 * A levy class: not an alternative to Normal Goods but a surcharge on top of
 * it, which is how a forwarder writes one. An appliance is in both rows.
 */
const APPLIANCE = {
  id: "gc-appliance",
  name: "Appliances",
  note: "",
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
    { id: "rr-sea-appl", goodsClassId: APPLIANCE.id, ratePerCbm: 10, isAvailable: true, note: "" },
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
    { id: "rr-air-appl", goodsClassId: APPLIANCE.id, ratePerCbm: 0, isAvailable: false, note: "" },
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
  categoryMap: {
    "cat-home": [NORMAL.id],
    // A fridge is a normal good *and* an appliance. Both rows are charged.
    "cat-appliances": [NORMAL.id, APPLIANCE.id],
    "cat-machinery": [HEAVY.id],
  },
  routes: [SEA, AIR],
};

const CURRENCIES: Currency[] = [
  { code: "GHS", name: "Ghana Cedi", symbol: "GH₵", rateToGhs: 1, isActive: true, autoUpdate: false, source: "" },
  { code: "USD", name: "US Dollar", symbol: "$", rateToGhs: 12, isActive: true, autoUpdate: true, source: "" },
];

const CONFIG: ShippingConfig = {
  defaults: { ...SHIPPING_DEFAULTS, baseFee: 10, perUnitFee: 1.5, perKgRate: 0, minFee: 0 },
  lanes: [],
  // Large-item pricing is on, and unpriced: the state a platform is in the
  // moment it upgrades. Nothing may be quoted differently because of it until
  // somebody says what a cubic metre costs.
  large: { ...LARGE_ITEM_DEFAULTS },
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

test("two sellers gathering in the same place are one load and one base fee", () => {
  // What decides whether two things travel together is whether they are in the
  // same place, not whose name is on the box. One van, one base fee, and the
  // second shop's goods increment.
  const fee = cartFee([line({ vendorId: "v-1" }), line({ vendorId: "v-2" })], "pp-accra");
  assert.equal(fee, 10 + 1.5);
});

test("two sellers gathering in different places are two loads and two base fees", () => {
  const elsewhere: ConsolidationPoint = { ...KUMASI, id: "cp-tamale", pickupPointId: "pp-tamale" };
  const fee = cartFee(
    [line({ vendorId: "v-1" }), line({ vendorId: "v-2", point: elsewhere })],
    "pp-accra",
  );
  assert.equal(fee, 20);
});

test("one seller gathering at two points is two consignments", () => {
  // Two loads, from two places, on two runs — one base fee would price a
  // journey nobody makes.
  const elsewhere: ConsolidationPoint = { ...KUMASI, id: "cp-accra", pickupPointId: "pp-adenta" };
  assert.equal(cartFee([line(), line({ point: elsewhere })], "pp-accra"), 20);
});

test("the base fee is the dearest in the load, charged once", () => {
  // A fridge and a phone case in one handover: the fridge sets the base — by
  // its size, since a flat fee is the wrong shape for it — and the case adds
  // its own small increment rather than riding free.
  const config: ShippingConfig = {
    ...CONFIG,
    lanes: [lane({ destKey: locationKeyForPickup("pp-accra"), largeRatePerCbm: 60 })],
  };
  const fee = cartFee(
    [line({ size: { lengthCm: 180, widthCm: 70, heightCm: 85, shippingWeightKg: 90 } }), line()],
    "pp-accra",
    config,
  );
  assert.equal(fee, 64.26 + 1.5); // 1.071 m³ × 60, then the ordinary increment
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

// --- The grid ---------------------------------------------------------------

/** A cell, with everything unstated left to the platform defaults. */
function lane(over: Partial<LaneFee> = {}): LaneFee {
  return {
    id: `lane-${over.originKey ?? "o"}-${over.destKey ?? "d"}`,
    originKey: locationKeyForPoint(KUMASI),
    destKey: locationKeyForPickup("pp-accra"),
    baseFee: null,
    perUnitFee: null,
    largeRatePerCbm: 0,
    largeMinFee: 0,
    note: "",
    isActive: true,
    ...over,
  };
}

const LANES: LaneFee[] = [
  lane({ id: "ksi-accra", destKey: locationKeyForPickup("pp-accra"), baseFee: 35 }),
  lane({ id: "ksi-tamale", destKey: locationKeyForPickup("pp-tamale"), baseFee: 0 }),
];

const GRID: ShippingConfig = { ...CONFIG, lanes: LANES };

test("a consolidation point at a station is the same location as the station", () => {
  // KUMASI sits at pp-kumasi, so a cell written against either addresses one
  // place. Two rows for one building is how the same journey ends up with two
  // prices.
  assert.equal(locationKeyForPoint(KUMASI), locationKeyForPickup("pp-kumasi"));
  // A depot at no station keeps its own identity.
  assert.equal(locationKeyForPoint(TEMA), locationKeyForPickup("pp-tema"));
  assert.equal(
    locationKeyForPoint({ id: "cp-lonely", pickupPointId: null }),
    "cp:cp-lonely",
  );
});

test("each journey charges its own base fee", () => {
  // The same seller, the same goods, two stations, two prices — which is the
  // whole reason the grid exists.
  assert.equal(cartFee([line()], "pp-accra", GRID), 35);
  assert.equal(cartFee([line()], "pp-tamale", GRID), 0);
  // A journey with no cell still falls to the platform default.
  assert.equal(cartFee([line()], "pp-elsewhere", GRID), 10);
});

test("a lane priced at zero is free, not unset", () => {
  const cell = resolveLaneFee(LANES, locationKeyForPoint(KUMASI), locationKeyForPickup("pp-tamale"));
  assert.equal(cell?.baseFee, 0);
  assert.equal(cartFee([line({ quantity: 3 })], "pp-tamale", GRID), 3); // 0 + 2 increments
});

test("a cell's own increment beats the platform's, and zero means extras ride free", () => {
  const config: ShippingConfig = {
    ...CONFIG,
    lanes: [
      lane({ destKey: locationKeyForPickup("pp-accra"), baseFee: 20, perUnitFee: 6 }),
      lane({ id: "flat", destKey: locationKeyForPickup("pp-tamale"), baseFee: 40, perUnitFee: 0 }),
    ],
  };
  assert.equal(cartFee([line({ quantity: 3 })], "pp-accra", config), 20 + 12);
  assert.equal(cartFee([line({ quantity: 9 })], "pp-tamale", config), 40);
});

test("a cell may price only the increment and leave the base to the default", () => {
  const config: ShippingConfig = {
    ...CONFIG,
    lanes: [lane({ destKey: locationKeyForPickup("pp-accra"), perUnitFee: 4 })],
  };
  assert.equal(cartFee([line({ quantity: 2 })], "pp-accra", config), 10 + 4);
});

test("the lane's base fee is charged once, and the increments are untouched by it", () => {
  // Ten bottles from one shop: one van, one base fee, nine increments.
  assert.equal(cartFee([line({ quantity: 10 })], "pp-accra", GRID), 35 + 9 * 1.5);
});

test("a paused lane falls back rather than pricing", () => {
  const paused = { ...GRID, lanes: LANES.map((l) => ({ ...l, isActive: false })) };
  assert.equal(
    resolveLaneFee(paused.lanes, locationKeyForPoint(KUMASI), locationKeyForPickup("pp-accra")),
    null,
  );
  assert.equal(cartFee([line()], "pp-accra", paused), 10);
});

test("a consolidation point and the station it sits at share one cell", () => {
  // The cell is written against the station; the goods leave a point that sits
  // there. One place, one price — this is the bug the merged identity fixes.
  const byStation: LaneFee[] = [
    lane({
      originKey: locationKeyForPickup("pp-kumasi"),
      destKey: locationKeyForPickup("pp-accra"),
      baseFee: 42,
    }),
  ];
  assert.equal(cartFee([line()], "pp-accra", { ...CONFIG, lanes: byStation }), 42);
});

test("a depot at no station is a location in its own right", () => {
  const depot: ConsolidationPoint = { ...KUMASI, id: "cp-csl", pickupPointId: null };
  const config: ShippingConfig = {
    ...CONFIG,
    lanes: [lane({ originKey: "cp:cp-csl", destKey: locationKeyForPickup("pp-accra"), baseFee: 18 })],
  };
  assert.equal(cartFee([line({ point: depot })], "pp-accra", config), 18);
  // And that cell prices nothing leaving anywhere else.
  assert.equal(cartFee([line()], "pp-accra", config), 10);
});

test("two shops in one place share the dearest base and increment the rest", () => {
  const config: ShippingConfig = {
    ...CONFIG,
    lanes: [lane({ destKey: locationKeyForPickup("pp-accra"), baseFee: 30, perUnitFee: 4 })],
  };
  const fee = cartFee(
    [line({ vendorId: "v-1", quantity: 2 }), line({ vendorId: "v-2", quantity: 3 })],
    "pp-accra",
    config,
  );
  // One van: one base fee, four increments — not two base fees.
  assert.equal(fee, 30 + 4 * 4);
});

test("the consignment names every shop with goods in it", () => {
  const { consignments } = quoteConsignments(
    [line({ vendorId: "v-1" }), line({ vendorId: "v-2" }), line({ vendorId: "v-1" })],
    "pp-accra",
    GRID,
  );
  assert.equal(consignments.length, 1);
  assert.deepEqual(consignments[0].vendorIds, ["v-1", "v-2"]);
});

// --- Large items ------------------------------------------------------------

/** A chest freezer: 1.8 × 0.7 × 0.85 m, which is 1.071 m³. */
const FREEZER = { shippingWeightKg: 90, lengthCm: 180, widthCm: 70, heightCm: 85 };
/** A microwave: large by nothing, and half a cubic metre smaller. */
const MICROWAVE = { shippingWeightKg: 15, lengthCm: 50, widthCm: 40, heightCm: 30 };

const ACCRA = locationKeyForPickup("pp-accra");

const BY_SIZE: ShippingConfig = {
  ...GRID,
  lanes: LANES.map((l) => (l.destKey === ACCRA ? { ...l, largeRatePerCbm: 100 } : l)),
  large: { ...LARGE_ITEM_DEFAULTS, extraPercent: 60 },
};

test("the thresholds decide what is large, and a zero is not a test", () => {
  const policy = { ...LARGE_ITEM_DEFAULTS };
  assert.equal(isLargeItem(FREEZER, policy), true);
  assert.equal(isLargeItem(MICROWAVE, policy), false);
  // Nothing measured trips nothing — the engine's five-litre default volume is
  // for filling containers, not for deciding that a listing is a fridge.
  assert.equal(isLargeItem({ shippingWeightKg: 2 }, policy), false);
  // Weight alone is enough, and so is size alone.
  assert.equal(isLargeItem({ shippingWeightKg: 60 }, policy), true);
  assert.equal(isLargeItem(FREEZER, { ...policy, minLongestSideCm: 0, minCbm: 0, minWeightKg: 0 }), false);
  assert.equal(isLargeItem(FREEZER, { ...policy, enabled: false }), false);
});

test("a large item is priced by its dimensions, not by the lane's flat fee", () => {
  // 1.071 m³ × GH₵100. The lane's flat GH₵35 does not apply to a freezer.
  assert.equal(cartFee([line({ size: FREEZER })], "pp-accra", BY_SIZE), 107.1);
});

test("two large items: the largest is the base, the rest are increments by size", () => {
  const fee = cartFee(
    [line({ size: FREEZER }), line({ size: { ...FREEZER, lengthCm: 90 } })],
    "pp-accra",
    BY_SIZE,
  );
  // The freezer sets the base at 107.1; the half-length one adds 60% of its own
  // 0.5355 m³ × 100 = 32.13. A second base fee is never charged.
  assert.equal(fee, 107.1 + 32.13);
});

test("two of the same large item still travel on one van", () => {
  const fee = cartFee([line({ size: FREEZER, quantity: 2 })], "pp-accra", BY_SIZE);
  assert.equal(fee, 107.1 + 64.26);
  // And that is less than paying twice, which is the point of an increment.
  assert.ok(fee < 107.1 * 2);
});

test("a large item beside a small one takes the base, and the small one increments", () => {
  const fee = cartFee(
    [line({ size: FREEZER }), line({ size: MICROWAVE, quantity: 2 })],
    "pp-accra",
    BY_SIZE,
  );
  // The freezer's 107.1 is the largest base in the consignment; the two
  // microwaves add the ordinary GH₵1.50 increment each.
  assert.equal(fee, 107.1 + 3);
});

test("a large item nobody has priced by size falls back to the flat fee, never to free", () => {
  // Enabled, thresholds set, and no rate per cubic metre anywhere.
  assert.equal(cartFee([line({ size: FREEZER })], "pp-accra", GRID), 35);
  assert.equal(cartFee([line({ size: FREEZER })], "pp-elsewhere", GRID), 10);
});

test("the platform rate per m³ covers a lane that has not priced large goods", () => {
  const config: ShippingConfig = {
    ...GRID,
    large: { ...LARGE_ITEM_DEFAULTS, ratePerCbm: 80 },
  };
  assert.equal(cartFee([line({ size: FREEZER })], "pp-accra", config), 85.68); // 1.071 × 80
});

test("a lane's own rate beats the platform's, and its minimum floors the price", () => {
  const config: ShippingConfig = {
    ...GRID,
    lanes: LANES.map((l) =>
      l.destKey === ACCRA ? { ...l, largeRatePerCbm: 100, largeMinFee: 250 } : l,
    ),
    large: { ...LARGE_ITEM_DEFAULTS, ratePerCbm: 80 },
  };
  assert.equal(cartFee([line({ size: FREEZER })], "pp-accra", config), 250);
});

test("switching large-item pricing off puts fridges back on the flat base fee", () => {
  const off: ShippingConfig = { ...BY_SIZE, large: { ...BY_SIZE.large, enabled: false } };
  assert.equal(cartFee([line({ size: FREEZER })], "pp-accra", off), 35);
});

test("collecting where a large item already sits is still free", () => {
  assert.equal(cartFee([line({ size: FREEZER })], "pp-kumasi", BY_SIZE), 0);
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

test("a category maps to every class it falls into, else their default", () => {
  assert.deepEqual(
    resolveGoodsClasses(FORWARDER, "cat-appliances").map((g) => g.id),
    [NORMAL.id, APPLIANCE.id],
  );
  assert.deepEqual(
    resolveGoodsClasses(FORWARDER, "cat-machinery").map((g) => g.id),
    [HEAVY.id],
  );
  assert.deepEqual(
    resolveGoodsClasses(FORWARDER, "cat-nothing").map((g) => g.id),
    [NORMAL.id],
  );
  assert.deepEqual(resolveGoodsClasses(null, "cat-home"), []);
});

test("the rates of every class an item is in are added together", () => {
  const both = resolveLaneRate(SEA, [NORMAL, APPLIANCE]);
  assert.equal(both.ratePerCbm, 270); // $260 for the goods, $10 because it plugs in
  assert.equal(both.isAvailable, true);
});

test("one N/A cell refuses the whole line, whatever the other rows say", () => {
  // Air takes normal goods at $900 and will not touch an appliance. A fridge is
  // both, so it does not fly — the priced row must not quietly win.
  const lane = resolveLaneRate(AIR, [NORMAL, APPLIANCE]);
  assert.equal(lane.isAvailable, false);
});

test("the catch-all applies only when no class has a cell of its own", () => {
  const unknown = { ...NORMAL, id: "gc-unknown" };
  assert.equal(resolveLaneRate(SEA, [unknown]).ratePerCbm, 280);
  // Never added on top of a real rate.
  assert.equal(resolveLaneRate(SEA, [NORMAL]).ratePerCbm, 260);
  assert.equal(resolveLaneRate(null, [NORMAL]).isAvailable, false);
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

test("a levy raises the rate and never the volume", () => {
  const priced = priceLine(
    line({ originCountry: "CN", point: TEMA, forwarder: FORWARDER, categoryId: "cat-appliances", size: { cbm: 2 } }),
    "pp-accra",
    CONFIG,
  );
  // 2 m³ × ($260 + $10) × 12. The volume is what a tape measure says it is.
  assert.equal(priced.cbm, 2);
  assert.equal(priced.ratePerCbm, 270);
  assert.equal(priced.internationalFreight, 6480);
  assert.deepEqual(priced.goodsClasses.map((g) => g.id), [NORMAL.id, APPLIANCE.id]);
});

test("a $10 levy bills $10 a cubic metre, not ten cubic metres", () => {
  // The bug this replaced: a levy typed as "10" was read as ten extra cubic
  // metres, so a 0.125 m³ carton at $10/m³ came to GH₵1,215 instead of GH₵15.
  const appliancesOnly: Forwarder = {
    ...FORWARDER,
    categoryMap: { ...FORWARDER.categoryMap, "cat-appliances": [APPLIANCE.id] },
  };
  const priced = priceLine(
    line({
      originCountry: "CN",
      point: TEMA,
      forwarder: appliancesOnly,
      categoryId: "cat-appliances",
      size: { cbm: 0.125 },
    }),
    "pp-accra",
    CONFIG,
  );
  assert.equal(priced.internationalFreight, 15); // 0.125 × $10 × 12
});

test("a lane that refuses one of the classes leaves the line unpriced", () => {
  const priced = priceLine(
    line({
      originCountry: "CN",
      point: TEMA,
      forwarder: FORWARDER,
      categoryId: "cat-appliances",
      routeId: AIR.id,
    }),
    "pp-accra",
    CONFIG,
  );
  assert.equal(priced.unpricedRoute, true);
  assert.equal(priced.internationalFreight, 0);
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
