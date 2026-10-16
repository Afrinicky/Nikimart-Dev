import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WATERMARK,
  WATERMARK_ANCHORS,
  WATERMARK_NUDGE_LIMIT,
  anchorFor,
  anchorPoint,
  photoCanvasSize,
  photoFileName,
  placementFor,
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

// ---------------------------------------------------------------------------
// Placing a mark by dragging it
// ---------------------------------------------------------------------------

const BOX = { width: 1000, height: 800 };

test("a point picks the anchor whose third of the picture it is in", () => {
  assert.equal(anchorFor({ x: 10, y: 10 }, BOX), "top-left");
  assert.equal(anchorFor({ x: 500, y: 10 }, BOX), "top-center");
  assert.equal(anchorFor({ x: 990, y: 10 }, BOX), "top-right");
  assert.equal(anchorFor({ x: 10, y: 400 }, BOX), "middle-left");
  assert.equal(anchorFor({ x: 500, y: 400 }, BOX), "center");
  assert.equal(anchorFor({ x: 990, y: 400 }, BOX), "middle-right");
  assert.equal(anchorFor({ x: 10, y: 790 }, BOX), "bottom-left");
  assert.equal(anchorFor({ x: 500, y: 790 }, BOX), "bottom-center");
  assert.equal(anchorFor({ x: 990, y: 790 }, BOX), "bottom-right");
});

test("a drag that lands on an anchor needs no nudge", () => {
  const item = { width: 200, height: 60 };
  const padding = 30;
  for (const anchor of WATERMARK_ANCHORS) {
    const at = anchorPoint(anchor.key, BOX, item, padding);
    const placed = placementFor(at, BOX, item, padding);
    assert.equal(placed.anchor, anchor.key, anchor.key);
    assert.equal(placed.dx, 0, `${anchor.key} dx`);
    assert.equal(placed.dy, 0, `${anchor.key} dy`);
  }
});

test("a drag off an anchor becomes that anchor plus a small offset", () => {
  const item = { width: 200, height: 60 };
  const padding = 30;
  const at = anchorPoint("bottom-right", BOX, item, padding);
  const placed = placementFor({ x: at.x - 50, y: at.y - 40 }, BOX, item, padding);
  assert.equal(placed.anchor, "bottom-right");
  assert.equal(placed.dx, -5); // 50px of 1000 wide
  assert.equal(placed.dy, -5); // 40px of 800 tall
  // And it round-trips back to the point that was dragged to.
  const back = anchorPoint(placed.anchor, BOX, item, padding, {
    x: (placed.dx / 100) * BOX.width,
    y: (placed.dy / 100) * BOX.height,
  });
  assert.equal(Math.round(back.x), Math.round(at.x - 50));
  assert.equal(Math.round(back.y), Math.round(at.y - 40));
});

test("a placement stays inside what the config can store", () => {
  const item = { width: 10, height: 10 };
  const placed = placementFor({ x: -100_000, y: 100_000 }, BOX, item, 0);
  assert.equal(placed.dx, -WATERMARK_NUDGE_LIMIT);
  assert.equal(placed.dy, WATERMARK_NUDGE_LIMIT);
  const resolved = resolveWatermark({ dx: placed.dx, dy: placed.dy });
  assert.equal(resolved.dx, -WATERMARK_NUDGE_LIMIT);
  assert.equal(resolved.dy, WATERMARK_NUDGE_LIMIT);
});
