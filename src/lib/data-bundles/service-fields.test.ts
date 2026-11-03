import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkServiceAnswers,
  findSpeed,
  mergeServiceFields,
  openSpeeds,
  resolveServiceFields,
  resolveServiceSpeeds,
  serviceFieldKey,
  servicePricing,
  variantIsOrderable,
} from "./service-fields.ts";

/**
 * The service form, which is data rather than code.
 *
 * Everything here arrives as JSON from a column an admin edits, so the cost of
 * being wrong is a public order form that will not render — or, worse, one
 * that takes a payment against a price nobody meant. Run with: npm test
 */

test("a field's key is derived from its label and never collides", () => {
  assert.equal(serviceFieldKey("Full name"), "full_name");
  assert.equal(serviceFieldKey("Proposed business name #1"), "proposed_business_name_1");
  assert.equal(serviceFieldKey("Full name", ["full_name"]), "full_name_2");
  // Nothing usable in the label still has to produce a key.
  assert.equal(serviceFieldKey("—"), "field");
});

test("unreadable field JSON is an empty form, not a crash", () => {
  assert.deepEqual(resolveServiceFields("not json"), []);
  assert.deepEqual(resolveServiceFields(""), []);
  assert.deepEqual(resolveServiceFields(null), []);
  assert.deepEqual(resolveServiceFields('{"label":"not an array"}'), []);
});

test("fields are clamped on the way in", () => {
  const fields = resolveServiceFields(
    JSON.stringify([
      { label: "Full name", type: "text", required: true },
      { label: "", type: "text" }, // a question with no question
      { label: "Business type", type: "select", options: ["Sole", "Limited", ""] },
      { label: "Empty list", type: "select", options: [] },
      { label: "Odd type", type: "wormhole" },
    ]),
  );

  assert.equal(fields.length, 4);
  assert.equal(fields[0].key, "full_name");
  assert.equal(fields[0].required, true);
  assert.deepEqual(fields[1].options, ["Sole", "Limited"]);
  // A choice list with nothing to choose from cannot be got past, so it is
  // demoted rather than shipped.
  assert.equal(fields[2].type, "text");
  assert.equal(fields[3].type, "text");
});

test("a variant's questions never overwrite the service's", () => {
  const service = resolveServiceFields(JSON.stringify([{ label: "Full name" }]));
  const variant = resolveServiceFields(JSON.stringify([{ label: "Full name" }]));
  const merged = mergeServiceFields(service, variant);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].key, "full_name");
  assert.equal(merged[1].key, "full_name_2");
});

test("answers are checked in the order the form asks", () => {
  const fields = resolveServiceFields(
    JSON.stringify([
      { label: "Full name", required: true },
      { label: "Email", type: "email", required: true },
      { label: "Ghana Card", type: "file", required: true },
    ]),
  );

  const missing = checkServiceAnswers(fields, {});
  assert.equal(missing.ok, false);
  assert.equal(missing.error, "Full name is required.");

  const badEmail = checkServiceAnswers(fields, { full_name: "Ama", email: "ama@" }, ["ghana_card"]);
  assert.equal(badEmail.ok, false);
  assert.match(badEmail.error ?? "", /valid email/);

  const noFile = checkServiceAnswers(fields, { full_name: "Ama", email: "ama@mail.com" });
  assert.equal(noFile.ok, false);
  assert.match(noFile.error ?? "", /Attach/);

  const good = checkServiceAnswers(
    fields,
    { full_name: "Ama", email: "ama@mail.com" },
    ["ghana_card"],
  );
  assert.equal(good.ok, true);
  // The label travels with the answer, so the order still reads correctly
  // after somebody edits the form.
  assert.deepEqual(good.answers, [
    { key: "full_name", label: "Full name", value: "Ama" },
    { key: "email", label: "Email", value: "ama@mail.com" },
  ]);
});

test("a choice list only accepts its own choices", () => {
  const fields = resolveServiceFields(
    JSON.stringify([{ label: "Type", type: "select", options: ["Sole", "Limited"] }]),
  );
  assert.equal(checkServiceAnswers(fields, { type: "Limited" }).ok, true);
  assert.equal(checkServiceAnswers(fields, { type: "Partnership" }).ok, false);
});

test("speed options are clamped and keyed", () => {
  const speeds = resolveServiceSpeeds(
    JSON.stringify([
      { label: "Standard", extraFee: 0, turnaround: "10 working days" },
      { label: "Fast track", extraFee: "150.456", turnaround: "3 working days" },
      { label: "", extraFee: 10 },
      { label: "Negative", extraFee: -50 },
    ]),
  );

  assert.equal(speeds.length, 3);
  assert.equal(speeds[0].key, "standard");
  assert.equal(speeds[1].extraFee, 150.46);
  assert.equal(speeds[2].extraFee, 0);
  assert.deepEqual(resolveServiceSpeeds("not json"), []);
});

test("a speed fee reaches Nickimart whole and moves nobody's commission", () => {
  const plain = servicePricing({ sellPrice: 400, costPrice: 300, speedFee: 0 });
  assert.deepEqual(plain, { price: 400, cost: 300, commission: 100 });

  const expedited = servicePricing({ sellPrice: 400, costPrice: 300, speedFee: 150 });
  assert.equal(expedited.price, 550);
  assert.equal(expedited.cost, 450);
  assert.equal(expedited.commission, 100);

  // Nickimart's own storefront sells at its own price and earns no commission.
  const house = servicePricing({ sellPrice: 400, costPrice: 400, speedFee: 0 });
  assert.equal(house.commission, 0);

  // An agent priced below their cost must never produce a negative commission.
  const underwater = servicePricing({ sellPrice: 200, costPrice: 300, speedFee: 0 });
  assert.equal(underwater.commission, 0);
});

test("a speed written before the switch existed reads as open", () => {
  const speeds = resolveServiceSpeeds(
    JSON.stringify([
      { label: "Fast track", extraFee: 150 },
      { label: "Same day", extraFee: 400, enabled: false },
    ]),
  );
  assert.equal(speeds[0].enabled, true);
  assert.equal(speeds[1].enabled, false);
  assert.deepEqual(
    openSpeeds(speeds).map((s) => s.label),
    ["Fast track"],
  );
});

test("a suspended lane cannot be ordered, even by key", () => {
  const speeds = resolveServiceSpeeds(
    JSON.stringify([{ key: "same_day", label: "Same day", extraFee: 400, enabled: false }]),
  );
  // A storefront left open in a tab still has the old key in hand.
  assert.equal(findSpeed(speeds, "same_day"), null);
});

test("something always has to be choosable", () => {
  const open = resolveServiceSpeeds(JSON.stringify([{ label: "Fast track", extraFee: 150 }]));
  const closed = resolveServiceSpeeds(
    JSON.stringify([{ label: "Fast track", extraFee: 150, enabled: false }]),
  );

  // Standard on is always fine, whatever the lanes say.
  assert.equal(variantIsOrderable({ standardEnabled: true, speeds: [] }), true);
  assert.equal(variantIsOrderable({ standardEnabled: true, speeds: closed }), true);
  // Fast-track only is fine while that lane is open.
  assert.equal(variantIsOrderable({ standardEnabled: false, speeds: open }), true);
  // Both off is an option nobody can buy.
  assert.equal(variantIsOrderable({ standardEnabled: false, speeds: closed }), false);
  assert.equal(variantIsOrderable({ standardEnabled: false, speeds: [] }), false);
});
