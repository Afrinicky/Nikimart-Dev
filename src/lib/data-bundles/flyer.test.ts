import test from "node:test";
import assert from "node:assert/strict";
// Relative, with the extension: these run through Node's type stripping, which
// resolves neither the "@/…" alias nor a missing extension.
import { flyerColumns, flyerShareText } from "./flyer.ts";

const bundle = (network: string, sizeGb: number, price: number) =>
  ({ network, sizeGb, price }) as Parameters<typeof flyerColumns>[0][number];

test("columns come out in network order, smallest bundle first", () => {
  const columns = flyerColumns([
    bundle("TELECEL", 10, 46),
    bundle("MTN", 5, 23),
    bundle("TELECEL", 5, 23),
    bundle("MTN", 1, 4.6),
  ]);
  assert.deepEqual(
    columns.map((c) => c.network),
    ["MTN", "TELECEL"],
  );
  assert.deepEqual(
    columns[0].rows.map((r) => r.sizeGb),
    [1, 5],
  );
});

test("a network with nothing priced doesn't get an empty column", () => {
  const columns = flyerColumns([bundle("MTN", 1, 4.6), bundle("TELECEL", 5, 0)]);
  assert.deepEqual(
    columns.map((c) => c.network),
    ["MTN"],
  );
});

test("with more networks than fit, the longest ladders win but keep their order", () => {
  const columns = flyerColumns([
    bundle("MTN", 1, 5),
    bundle("MTN", 2, 10),
    bundle("TELECEL", 5, 23),
    bundle("AIRTELTIGO_ISHARE", 1, 5),
    bundle("AIRTELTIGO_ISHARE", 2, 10),
    bundle("AIRTELTIGO_ISHARE", 3, 15),
    bundle("AIRTELTIGO_BIGTIME", 50, 145),
    bundle("AIRTELTIGO_BIGTIME", 80, 190),
  ]);
  assert.equal(columns.length, 3);
  // Telecel has one row and drops; the rest stay in NETWORKS order.
  assert.deepEqual(
    columns.map((c) => c.network),
    ["MTN", "AIRTELTIGO_ISHARE", "AIRTELTIGO_BIGTIME"],
  );
});

test("the share message carries the store link, which is the point of it", () => {
  const text = flyerShareText({
    storeName: "Joycy Data",
    storeLink: "nickimart.com/store/joycy",
    phone: "0204176288",
    bundles: [],
    afaPrice: null,
    tagline: "",
  });
  assert.ok(text.includes("nickimart.com/store/joycy"));
  assert.ok(text.includes("0204176288"));
});
