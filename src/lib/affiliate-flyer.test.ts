import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coverSource,
  flyerFileName,
  flyerTheme,
  productFlyerShareText,
  wrapLines,
} from "./affiliate-flyer.ts";

/**
 * The flyer's arithmetic, pinned down.
 *
 * The drawing itself needs a canvas and is judged by eye; what is tested here
 * is everything that decides what the picture contains — how a photograph of
 * the wrong shape is cropped, how a long product name is packed, and whether
 * the message that goes to WhatsApp can ever go out without the link in it.
 *
 * Run with: npm test
 */

// A measurer standing in for the canvas: every character is ten units wide.
const measure = (text: string) => text.length * 10;

// ---------------------------------------------------------------------------
// Cover-fitting a photograph
// ---------------------------------------------------------------------------

test("a square photo in a square box is not cropped at all", () => {
  assert.deepEqual(coverSource(800, 800, 400, 400), { x: 0, y: 0, width: 800, height: 800 });
});

test("a wide photo is cropped at the sides, equally", () => {
  const src = coverSource(1600, 800, 400, 400);
  assert.equal(src.height, 800);
  assert.equal(src.width, 800);
  assert.equal(src.x, 400);
  assert.equal(src.y, 0);
});

test("a tall photo is cropped top and bottom, equally", () => {
  const src = coverSource(800, 1600, 400, 400);
  assert.equal(src.width, 800);
  assert.equal(src.height, 800);
  assert.equal(src.x, 0);
  assert.equal(src.y, 400);
});

test("a non-square box crops to its own ratio, never stretches", () => {
  // A 2:1 box from a square photo keeps the full width and halves the height.
  const src = coverSource(1000, 1000, 1000, 500);
  assert.equal(src.width, 1000);
  assert.equal(src.height, 500);
  assert.equal(src.y, 250);
});

test("a photo with no dimensions does not produce a zero-sized crop", () => {
  const src = coverSource(0, 0, 400, 400);
  assert.ok(src.width >= 1 && src.height >= 1);
});

// ---------------------------------------------------------------------------
// Packing text
// ---------------------------------------------------------------------------

test("a short name is one line", () => {
  assert.deepEqual(wrapLines("Kente throw", 500, measure, 2), ["Kente throw"]);
});

test("a long name wraps on words", () => {
  const lines = wrapLines("Handwoven Kente throw blanket in royal blue", 200, measure, 3);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(measure(line) <= 200, `"${line}" is too wide`);
});

test("text beyond the line budget is elided rather than cut off mid-word", () => {
  const lines = wrapLines("one two three four five six seven eight nine ten", 100, measure, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
});

test("a word wider than the line overhangs rather than being split in half", () => {
  // Splitting a product code across two lines reads as two product codes.
  const lines = wrapLines("ABCDEFGHIJKLMNOP", 50, measure, 2);
  assert.deepEqual(lines, ["ABCDEFGHIJKLMNOP"]);
});

test("empty text is no lines, not one empty line", () => {
  assert.deepEqual(wrapLines("", 200, measure), []);
  assert.deepEqual(wrapLines("   ", 200, measure), []);
});

// ---------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------

const share = {
  productName: "Kente throw",
  price: "GH₵240",
  shopName: "Accra Weavers",
  link: "https://nickimart.com/r/ABC123",
};

test("the share message always carries the link", () => {
  const text = productFlyerShareText({ ...share, template: "Lovely piece, DM me" });
  assert.ok(text.includes(share.link));
});

test("a caption that names the product is left to stand on its own", () => {
  const text = productFlyerShareText({
    ...share,
    template: "{product} for {price} — {link}",
  });
  assert.equal(text, "Kente throw for GH₵240 — https://nickimart.com/r/ABC123");
});

test("a caption that doesn't name the product gets a headline above it", () => {
  const text = productFlyerShareText({ ...share, template: "Going fast {link}" });
  assert.ok(text.startsWith("*Kente throw* — GH₵240"));
  assert.ok(text.includes("Going fast"));
});

// ---------------------------------------------------------------------------
// Odds and ends
// ---------------------------------------------------------------------------

test("an unknown theme key falls back rather than drawing nothing", () => {
  assert.equal(flyerTheme("nonsense").key, "nickimart");
  assert.equal(flyerTheme(null).key, "nickimart");
  assert.equal(flyerTheme("clean").key, "clean");
});

test("the filename is a safe slug of the product", () => {
  assert.equal(flyerFileName("Kente Throw — Royal Blue!"), "kente-throw-royal-blue-nickimart.png");
  assert.equal(flyerFileName("***"), "nickimart-product-nickimart.png");
});
