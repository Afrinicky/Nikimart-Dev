import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DB_FOREIGN_KEY_VIOLATION,
  DB_UNIQUE_VIOLATION,
  describeDbError,
  failedOn,
} from "./db-errors.ts";

test("a unique violation reported as columns", () => {
  const f = describeDbError({ code: "P2002", meta: { target: ["ownerId"] } });
  assert.equal(f.code, DB_UNIQUE_VIOLATION);
  assert.deepEqual(f.fields, ["ownerid"]);
  assert.ok(failedOn(f, "ownerId"));
  assert.ok(!failedOn(f, "slug"));
});

test("a unique violation reported as an index name", () => {
  const f = describeDbError({ code: "P2002", meta: { target: "Vendor_ownerId_key" } });
  assert.ok(failedOn(f, "ownerId"));
});

test("an index name with a parenthesised note", () => {
  const f = describeDbError({
    code: "P2002",
    meta: { target: ["Vendor_slug_key (index)"] },
  });
  assert.ok(failedOn(f, "slug"));
});

test("a composite index names every column", () => {
  const f = describeDbError({
    code: "P2002",
    meta: { target: ["AffiliateProduct_affiliateId_productId_key"] },
  });
  assert.deepEqual(f.fields, ["affiliateid", "productid"]);
});

test("a foreign key violation names the field", () => {
  const f = describeDbError({
    code: "P2003",
    meta: { field_name: "Vendor_consolidationPointId_fkey (index)" },
  });
  assert.equal(f.code, DB_FOREIGN_KEY_VIOLATION);
  assert.ok(failedOn(f, "consolidationPointId"));
});

test("a name that does not follow the convention is kept whole", () => {
  const f = describeDbError({ code: "P2002", meta: { target: ["weird_key"] } });
  assert.deepEqual(f.fields, ["weird_key"]);
});

test("anything that is not a driver error reads as empty", () => {
  for (const thrown of [undefined, null, "boom", 7, new Error("boom"), {}]) {
    const f = describeDbError(thrown);
    assert.equal(f.code, "");
    assert.deepEqual(f.fields, []);
    assert.ok(!failedOn(f, "ownerId"));
  }
});
