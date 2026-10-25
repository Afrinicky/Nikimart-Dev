import assert from "node:assert/strict";
import test from "node:test";
import { catalogueGridClass } from "./catalogue-grid.ts";

test("with a sidebar, the first column is the sidebar's width", () => {
  const className = catalogueGridClass(true, "lg:gap-7");
  assert.match(className, /lg:grid-cols-\[15\.5rem_1fr\]/);
  assert.match(className, /lg:gap-7/);
});

test("without a sidebar, no column template — the page would take its place", () => {
  const className = catalogueGridClass(false, "lg:gap-7");
  assert.doesNotMatch(className, /grid-cols/);
  assert.doesNotMatch(className, /lg:grid\b/);
});
