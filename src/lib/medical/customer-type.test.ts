import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMER_TYPES,
  CUSTOMER_TYPE_LABELS,
  isCustomerType,
  needsInstitution,
} from "./customer-type.ts";

test("every type has a label a person would recognise", () => {
  for (const type of CUSTOMER_TYPES) {
    const label = CUSTOMER_TYPE_LABELS[type];
    assert.ok(label, `no label for ${type}`);
    assert.doesNotMatch(label, /_/);
  }
});

test("an unknown type is rejected rather than stored", () => {
  assert.equal(isCustomerType("HOSPITAL"), true);
  assert.equal(isCustomerType("hospital"), false);
  assert.equal(isCustomerType("DENTIST"), false);
  assert.equal(isCustomerType(null), false);
});

test("an individual is not asked which institution they are", () => {
  assert.equal(needsInstitution("INDIVIDUAL"), false);
  assert.equal(needsInstitution("OTHER"), false);
  assert.equal(needsInstitution("HOSPITAL"), true);
});
