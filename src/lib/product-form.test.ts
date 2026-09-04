import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildProductData } from "./product-form.ts";

/**
 * Every key this builds has to be a real Product column.
 *
 * Prisma rejects an unknown argument outright rather than ignoring it, so a
 * single stray key in this object fails the whole write. That is what happened:
 * `affiliateCommission` (a column on Order and OrderItem, never on Product,
 * whose own field is `affiliateCommissionRate`) sat in the returned object and
 * broke every product create and update from both the admin and the seller
 * console — whatever the edit was. Nothing typed it, because the object is
 * inferred and only meets Prisma at the call site.
 *
 * So the schema is read as the source of truth and the shape is checked against
 * it here, rather than trusting a reviewer to notice the next one.
 */

function productScalarFields(): Set<string> {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  const model = /^model Product \{$([\s\S]*?)^\}$/m.exec(schema);
  assert.ok(model, "could not find `model Product` in prisma/schema.prisma");
  const fields = new Set<string>();
  for (const raw of model[1].split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const name = /^(\w+)\s+\S/.exec(line);
    if (name) fields.add(name[1]);
  }
  assert.ok(fields.has("productType"), "field scrape looks wrong — productType missing");
  return fields;
}

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

/** A filled-in listing, of the shape the admin product form submits. */
const FULL = {
  name: "20000mAh Power Bank",
  description: "Fast charge, three ports.",
  price: "189",
  oldPrice: "249",
  stockQuantity: "12",
  productType: "preorder",
  categoryId: "cat-electronics",
  vendorId: "vendor-1",
  emoji: "🔋",
  shippingWeightKg: "0.6",
  lengthCm: "10",
  widthCm: "8",
  heightCm: "3",
  badges: "in_stock,flash_sale",
  locationIds: "loc-knust",
  images: '["https://example.test/a.jpg"]',
  attributes: '[{"label":"Capacity","value":"20000mAh"}]',
  affiliateEnabled: "on",
  affiliateFundedBy: "admin",
  affiliateCommissionRate: "7.5",
  isFeatured: "on",
  pickupAvailable: "on",
};

test("every built field is a real Product column", () => {
  const columns = productScalarFields();
  for (const key of Object.keys(buildProductData(form(FULL), { actor: "admin" }))) {
    assert.ok(
      columns.has(key),
      `buildProductData() returns "${key}", which is not a Product column — Prisma will reject the whole write`,
    );
  }
});

test("the same holds for a seller submission and for a bare form", () => {
  const columns = productScalarFields();
  const shapes = [
    buildProductData(form(FULL), { vendorId: "vendor-9", actor: "seller" }),
    buildProductData(form({ name: "Bare", description: "x", price: "1" })),
  ];
  for (const shape of shapes) {
    for (const key of Object.keys(shape)) {
      assert.ok(columns.has(key), `"${key}" is not a Product column`);
    }
  }
});

test("affiliate enrolment is written once, and to the rate column", () => {
  const data = buildProductData(form(FULL), { actor: "admin" });
  assert.equal(data.affiliateEnabled, true);
  assert.equal(data.affiliateEnrolledBy, "admin");
  assert.equal(data.affiliateCommissionRate, 7.5);
  // The column that broke it. Product has no such field.
  assert.ok(!("affiliateCommission" in data), "the phantom affiliateCommission key is back");
});

test("a seller cannot enrol a product at the platform's expense", () => {
  // Sellers may opt in, but only funding it themselves — "admin" here means
  // Nickimart pays the commission out of its own cut.
  const data = buildProductData(form(FULL), { vendorId: "v", actor: "seller" });
  assert.equal(data.affiliateEnrolledBy, "seller");
});

test("not enrolled clears the rate rather than leaving a stale one", () => {
  const { affiliateEnabled, ...rest } = FULL;
  void affiliateEnabled;
  const data = buildProductData(form(rest), { actor: "admin" });
  assert.equal(data.affiliateEnabled, false);
  assert.equal(data.affiliateEnrolledBy, "");
  assert.equal(data.affiliateCommissionRate, null);
});

test("the product type survives the round trip", () => {
  // The edit that surfaced the crash: switching In stock → another type.
  for (const kind of ["in_stock", "shipped_from_abroad", "service", "food"]) {
    const data = buildProductData(form({ ...FULL, productType: kind }));
    assert.equal(data.productType, kind);
  }
  // An empty select falls back rather than writing "".
  assert.equal(buildProductData(form({ ...FULL, productType: "" })).productType, "in_stock");
});

test("the legacy preorder type is normalised on save", () => {
  // Listings made before the rename are stored as "preorder" and are never
  // backfilled — migrations here are additive. Saving one through the form is
  // the one moment we can move it on, and both values mean the same thing
  // everywhere they are read (see lib/abroad).
  const data = buildProductData(form({ ...FULL, productType: "preorder" }));
  assert.equal(data.productType, "shipped_from_abroad");
});

test("switching away from shipped-from-abroad leaves no freight behind", () => {
  // A stale arrival point or leg-1 cost on an in-stock item would quietly bill
  // a buyer for freight that no longer applies to it.
  const data = buildProductData(
    form({
      ...FULL,
      productType: "in_stock",
      abroadTerms: JSON.stringify({
        arrivalPointId: "ap-tema",
        supplierFreight: 90,
        originCountry: "CN",
        freightIncluded: true,
      }),
    }),
  );
  assert.equal(data.arrivalPointId, null);
  assert.equal(data.supplierFreight, 0);
  assert.equal(data.originCountry, "");
  assert.equal(data.supplierDelivers, false);
  assert.equal(data.forwarderRouteId, null);
  assert.equal(data.preorderInfo, null);
});

test("the abroad columns are mirrored out of the submitted terms", () => {
  // The terms are one JSON blob for the buyer to read; these columns are what
  // the pricing and the queries actually join on, so they must agree.
  const data = buildProductData(
    form({
      ...FULL,
      productType: "shipped_from_abroad",
      abroadTerms: JSON.stringify({
        originCountry: "cn",
        sourceUrl: "https://www.alibaba.com/x",
        supplierName: "Shenzhen Kaiyuan",
        consolidationPointId: "cp-kia",
        forwarderId: "fw-gz",
        routeId: "rt-sea",
        supplierDelivers: false,
        supplierFreight: 90,
        supplierContact: "+86 000 000 0000",
      }),
    }),
  );
  assert.equal(data.originCountry, "CN");
  assert.equal(data.sourceUrl, "https://www.alibaba.com/x");
  assert.equal(data.supplierName, "Shenzhen Kaiyuan");
  assert.equal(data.arrivalPointId, "cp-kia");
  assert.equal(data.forwarderId, "fw-gz");
  // The lane, mirrored out too: it is what prices the leg into Ghana.
  assert.equal(data.forwarderRouteId, "rt-sea");
  assert.equal(data.supplierDelivers, false);
  assert.equal(data.supplierFreight, 90);
  assert.equal(data.supplierContact, "+86 000 000 0000");
});

test("switching a listing off the abroad type leaves no freight behind", () => {
  // A submission is a claim from a browser. A handcrafted one must not be able
  // to leave a forwarder on an in-stock item, where nothing would display it
  // and the pricing would still find it.
  const data = buildProductData(
    form({
      ...FULL,
      productType: "in_stock",
      abroadTerms: JSON.stringify({ forwarderId: "fw-gz", supplierFreight: 90, supplierDelivers: true }),
    }),
  );
  assert.equal(data.preorderInfo, null);
  assert.equal(data.forwarderId, null);
  assert.equal(data.supplierFreight, 0);
  assert.equal(data.supplierDelivers, false);
  assert.equal(data.originCountry, "");
});

test("a fixed shipping fee is only stored on the manual method", () => {
  // Otherwise a listing switched back to standard pricing would keep charging
  // a fee nothing on the form still shows.
  const manual = buildProductData(form({ ...FULL, shippingMethod: "manual", manualShippingFee: "1200" }));
  assert.equal(manual.shippingMethod, "manual");
  assert.equal(manual.manualShippingFee, 1200);

  const auto = buildProductData(form({ ...FULL, shippingMethod: "auto", manualShippingFee: "1200" }));
  assert.equal(auto.shippingMethod, "auto");
  assert.equal(auto.manualShippingFee, 0);

  // An unknown method is not a method.
  assert.equal(buildProductData(form({ ...FULL, shippingMethod: "teleport" })).shippingMethod, "auto");
});

test("a local listing states its consolidation point directly", () => {
  const data = buildProductData(form({ ...FULL, consolidationPointId: "cp-kumasi" }));
  assert.equal(data.arrivalPointId, "cp-kumasi");
});

test("CBM is derived from the dimensions when it isn't given", () => {
  const data = buildProductData(form(FULL));
  // 10 × 8 × 3 cm = 240cm³ = 0.00024 m³
  assert.equal(data.cbm, 0.00024);
  // An explicit value wins over the derived one.
  assert.equal(buildProductData(form({ ...FULL, cbm: "0.5" })).cbm, 0.5);
});
