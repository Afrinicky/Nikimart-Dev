import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WATERMARK,
  anchorPoint,
  photoCanvasSize,
  photoFileName,
  resolveWatermark,
} from "./affiliate-watermark.ts";

/**
 * The watermark's arithmetic, pinned down.
 *
 * The drawing is judged by eye; what is tested here is everything that decides
 * where the mark lands and how big the picture is — the parts that have to
 * keep meaning the same thing on a square product shot and on a tall one, and
 * the parts that come from a settings row somebody can type anything into.
 *
 * Run with: npm test
 */

const box = { width: 1000, height: 600 };
const item = { width: 200, height: 100 };

// ---------------------------------------------------------------------------
// Anchoring
// ---------------------------------------------------------------------------

test("each corner is the corner it says it is", () => {
  assert.deepEqual(anchorPoint("top-left", box, item, 20), { x: 20, y: 20 });
  assert.deepEqual(anchorPoint("top-right", box, item, 20), { x: 780, y: 20 });
  assert.deepEqual(anchorPoint("bottom-left", box, item, 20), { x: 20, y: 480 });
  assert.deepEqual(anchorPoint("bottom-right", box, item, 20), { x: 780, y: 480 });
});

test("the middles centre on the axis they do not pin", () => {
  assert.deepEqual(anchorPoint("top-center", box, item, 20), { x: 400, y: 20 });
  assert.deepEqual(anchorPoint("bottom-center", box, item, 20), { x: 400, y: 480 });
  assert.deepEqual(anchorPoint("middle-left", box, item, 20), { x: 20, y: 250 });
  assert.deepEqual(anchorPoint("center", box, item, 20), { x: 400, y: 250 });
});

test("a nudge moves the mark without changing which corner it is in", () => {
  const at = anchorPoint("bottom-right", box, item, 20, { x: -30, y: -10 });
  assert.deepEqual(at, { x: 750, y: 470 });
});

test("padding is the distance from the edge, both ends", () => {
  const left = anchorPoint("top-left", box, item, 50);
  const right = anchorPoint("top-right", box, item, 50);
  assert.equal(left.x, 50);
  assert.equal(box.width - (right.x + item.width), 50);
});

// ---------------------------------------------------------------------------
// The picture's own size
// ---------------------------------------------------------------------------

test("a photo small enough is left exactly as it is", () => {
  assert.deepEqual(photoCanvasSize(800, 1000, 1600), { width: 800, height: 1000 });
});

test("a big photo comes down to the long edge, keeping its shape", () => {
  const size = photoCanvasSize(4000, 3000, 1600);
  assert.equal(size.width, 1600);
  assert.equal(size.height, 1200);
  assert.equal(Math.round((size.width / size.height) * 100), Math.round((4000 / 3000) * 100));
});

test("a tall photo is measured on its own long edge", () => {
  const size = photoCanvasSize(1500, 3000, 1600);
  assert.equal(size.height, 1600);
  assert.equal(size.width, 800);
});

test("a photo with no dimensions still gives a canvas somebody can draw on", () => {
  const size = photoCanvasSize(0, 0);
  assert.ok(size.width >= 1 && size.height >= 1);
});

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

test("nothing stored is the default watermark", () => {
  assert.deepEqual(resolveWatermark(""), DEFAULT_WATERMARK);
  assert.deepEqual(resolveWatermark(null), DEFAULT_WATERMARK);
  assert.deepEqual(resolveWatermark("{broken"), DEFAULT_WATERMARK);
});

test("a stored watermark only overrides what it names", () => {
  const mark = resolveWatermark(JSON.stringify({ text: "Shop with Ama", anchor: "top-left" }));
  assert.equal(mark.text, "Shop with Ama");
  assert.equal(mark.anchor, "top-left");
  assert.equal(mark.size, DEFAULT_WATERMARK.size);
  assert.equal(mark.opacity, DEFAULT_WATERMARK.opacity);
});

test("the logo keeps its own size and corner", () => {
  const mark = resolveWatermark(
    JSON.stringify({ logo: { enabled: true, size: 22, anchor: "top-right" } }),
  );
  assert.equal(mark.logo.enabled, true);
  assert.equal(mark.logo.size, 22);
  assert.equal(mark.logo.anchor, "top-right");
  assert.equal(mark.logo.opacity, DEFAULT_WATERMARK.logo.opacity);
});

test("a watermark cannot be set to cover the whole picture or vanish", () => {
  const huge = resolveWatermark(JSON.stringify({ size: 400, opacity: 900, padding: 90 }));
  assert.ok(huge.size <= 20);
  assert.ok(huge.opacity <= 100);
  assert.ok(huge.padding <= 20);

  const tiny = resolveWatermark(JSON.stringify({ size: 0, opacity: 0 }));
  assert.ok(tiny.size >= 1);
  assert.ok(tiny.opacity >= 5);
});

test("an anchor that isn't one falls back", () => {
  const mark = resolveWatermark(JSON.stringify({ anchor: "somewhere", logo: { anchor: "x" } }));
  assert.equal(mark.anchor, DEFAULT_WATERMARK.anchor);
  assert.equal(mark.logo.anchor, DEFAULT_WATERMARK.logo.anchor);
});

test("switching the watermark off is a setting, not a missing one", () => {
  assert.equal(resolveWatermark(JSON.stringify({ enabled: false })).enabled, false);
});

test("the filename is a safe slug of the product", () => {
  assert.equal(photoFileName("Kente Throw — Royal Blue!"), "kente-throw-royal-blue.jpg");
  assert.equal(photoFileName("***"), "nickimart-product.jpg");
});
