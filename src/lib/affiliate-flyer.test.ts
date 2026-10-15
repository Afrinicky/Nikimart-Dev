import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FLYER_DESIGN,
  bulkShareText,
  FLYER_SLOTS,
  MAX_FLYER_EXTRAS,
  coverSource,
  designTheme,
  flyerFileName,
  flyerTheme,
  newFlyerExtra,
  productFlyerShareText,
  resolveFlyerDesign,
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

// ---------------------------------------------------------------------------
// The design
// ---------------------------------------------------------------------------

test("nothing stored means the design it falls back to", () => {
  assert.deepEqual(resolveFlyerDesign("", DEFAULT_FLYER_DESIGN), DEFAULT_FLYER_DESIGN);
  assert.deepEqual(resolveFlyerDesign(null, DEFAULT_FLYER_DESIGN), DEFAULT_FLYER_DESIGN);
});

test("unreadable JSON falls back rather than throwing on a share", () => {
  assert.deepEqual(resolveFlyerDesign("{not json", DEFAULT_FLYER_DESIGN), DEFAULT_FLYER_DESIGN);
  assert.deepEqual(resolveFlyerDesign("[1,2,3]", DEFAULT_FLYER_DESIGN), DEFAULT_FLYER_DESIGN);
});

test("a stored design only overrides what it names", () => {
  const design = resolveFlyerDesign(
    JSON.stringify({ frame: { height: 500 }, text: { name: { size: 60 } } }),
    DEFAULT_FLYER_DESIGN,
  );
  assert.equal(design.frame.height, 500);
  assert.equal(design.frame.top, DEFAULT_FLYER_DESIGN.frame.top, "untouched frame values stay");
  assert.equal(design.text.name.size, 60);
  assert.equal(design.text.name.weight, DEFAULT_FLYER_DESIGN.text.name.weight);
  assert.equal(design.text.price.size, DEFAULT_FLYER_DESIGN.text.price.size);
});

test("an affiliate's design layers onto the admin's rather than the built-in one", () => {
  const house = resolveFlyerDesign(JSON.stringify({ theme: "midnight", frame: { side: 70 } }));
  const theirs = resolveFlyerDesign(JSON.stringify({ frame: { radius: 0 } }), house);
  assert.equal(theirs.theme, "midnight", "the house theme reaches them");
  assert.equal(theirs.frame.side, 70, "so does the house margin");
  assert.equal(theirs.frame.radius, 0, "and their own change wins");
});

test("sizes out of any sane range are clamped, not accepted", () => {
  const design = resolveFlyerDesign(
    JSON.stringify({
      frame: { height: 99999, side: -40 },
      text: { price: { size: 0 }, name: { dx: 10_000 } },
    }),
  );
  assert.ok(design.frame.height <= 1000);
  assert.ok(design.frame.side >= 0);
  assert.ok(design.text.price.size >= 10);
  assert.ok(design.text.name.dx <= 400);
});

test("a colour that isn't one is refused", () => {
  const design = resolveFlyerDesign(
    JSON.stringify({ colours: { accent: "javascript:alert(1)", highlight: "#ff0000" } }),
  );
  assert.equal(design.colours.accent, DEFAULT_FLYER_DESIGN.colours.accent);
  assert.equal(design.colours.highlight, "#ff0000");
});

test("an unknown font or theme falls back to one that exists", () => {
  const design = resolveFlyerDesign(
    JSON.stringify({ theme: "neon", text: { name: { font: "comic" } } }),
  );
  assert.equal(design.theme, DEFAULT_FLYER_DESIGN.theme);
  assert.equal(design.text.name.font, DEFAULT_FLYER_DESIGN.text.name.font);
});

test("an element can be switched off and back on", () => {
  const off = resolveFlyerDesign(JSON.stringify({ text: { sharedBy: { visible: false } } }));
  assert.equal(off.text.sharedBy.visible, false);
  const on = resolveFlyerDesign(JSON.stringify({ text: { sharedBy: { visible: true } } }), off);
  assert.equal(on.text.sharedBy.visible, true);
});

test("the theme's colours come through, with overrides on top", () => {
  const plain = designTheme(resolveFlyerDesign(JSON.stringify({ theme: "clean" })));
  assert.equal(plain.accent, "#1d4ed8");
  const tweaked = designTheme(
    resolveFlyerDesign(JSON.stringify({ theme: "clean", colours: { accent: "#123456" } })),
  );
  assert.equal(tweaked.accent, "#123456");
  assert.equal(tweaked.card, plain.card, "what wasn't overridden is the theme's");
});

// --- Added features ---------------------------------------------------------

test("added lines are kept, capped and cleaned", () => {
  const design = resolveFlyerDesign(
    JSON.stringify({
      extras: [
        { id: "a", text: "Free delivery", slot: "onImage", align: "right", background: "#ff0000" },
        { id: "b", text: "   ", slot: "header" },
        { id: "c", text: "Call 024", slot: "aboveFooter", align: "nonsense" },
        { id: "d", text: "Four" },
        { id: "e", text: "Five" },
        { id: "f", text: "Six" },
      ],
    }),
  );
  // The blank one is dropped; the cap is applied before that, so five survive
  // the slice and four of them have words.
  assert.ok(design.extras.length <= MAX_FLYER_EXTRAS);
  assert.ok(design.extras.every((e) => e.text.trim() !== ""));

  const first = design.extras[0];
  assert.equal(first.slot, "onImage");
  assert.equal(first.align, "right");
  assert.equal(first.background, "#ff0000");

  const call = design.extras.find((e) => e.id === "c");
  assert.equal(call?.align, "left", "an alignment that isn't one falls back");
});

test("removing every added line is a design, not a missing field", () => {
  const withOne = resolveFlyerDesign(JSON.stringify({ extras: [{ id: "a", text: "Hi" }] }));
  assert.equal(withOne.extras.length, 1);
  const withNone = resolveFlyerDesign(JSON.stringify({ extras: [] }), withOne);
  assert.deepEqual(withNone.extras, [], "an empty list means they took it off");
});

test("a new added line starts usable", () => {
  const extra = newFlyerExtra("x1");
  assert.equal(extra.id, "x1");
  assert.ok(extra.text.trim().length > 0);
  assert.ok(FLYER_SLOTS.some((s) => s.key === extra.slot));
});

// ---------------------------------------------------------------------------
// Sharing several at once
// ---------------------------------------------------------------------------

const picks = [
  { name: "Kente throw", price: "GH₵240", link: "https://nickimart.com/r/AAA" },
  { name: "Clay teapot", price: "GH₵95", link: "https://nickimart.com/r/BBB" },
];

test("a bulk message carries every product and every link", () => {
  const text = bulkShareText(picks, "Lovely things today");
  for (const pick of picks) {
    assert.ok(text.includes(pick.name), `${pick.name} is missing`);
    assert.ok(text.includes(pick.link), `${pick.name}'s link is missing`);
    assert.ok(text.includes(pick.price), `${pick.name}'s price is missing`);
  }
  assert.ok(text.includes("Lovely things today"));
});

test("the caption leads once rather than per product", () => {
  const text = bulkShareText(picks, "Order with my link");
  assert.equal(text.split("Order with my link").length - 1, 1);
});

test("one product falls back to the ordinary single share", () => {
  const text = bulkShareText([picks[0]], "{product} for {price} — {link}");
  assert.equal(text, "Kente throw for GH₵240 — https://nickimart.com/r/AAA");
});

test("products with no link are left out rather than listed unbuyable", () => {
  const text = bulkShareText([picks[0], { name: "Mystery", price: "GH₵1", link: "" }], "Hi");
  assert.ok(!text.includes("Mystery"));
  assert.ok(text.includes("Kente throw"));
});

test("nothing to share is just the caption", () => {
  assert.equal(bulkShareText([], "  Nothing today  "), "Nothing today");
});
