import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FLYER_DESIGN,
  FLYER_SIZE_RANGE,
  FLYER_SLOTS,
  MAX_FLYER_EXTRAS,
  NUDGE_LIMIT,
  clampNudge,
  clampSize,
  batchShareText,
  coverSource,
  designTheme,
  extraWords,
  flyerContent,
  flyerFileName,
  flyerTheme,
  hitAt,
  newFlyerExtra,
  productFlyerShareText,
  resolveFlyerDesign,
  wrapLines,
  type FlyerHit,
  type ProductFlyerData,
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

test("each product in a batch gets a message carrying only its own link", () => {
  const picks = [
    { name: "Kente throw", price: "GH\u20b5240", shop: "Kumasi Weaves", link: "https://nickimart.com/r/AAA" },
    { name: "Clay teapot", price: "GH\u20b595", shop: "Clay & Co", link: "https://nickimart.com/r/BBB" },
  ];

  // What the batch share now builds: one message per product, the way it
  // would read if that product had been shared on its own. A message that
  // carried the other product's link is the bug this guards.
  const messages = picks.map((pick) =>
    productFlyerShareText({
      productName: pick.name,
      price: pick.price,
      shopName: pick.shop,
      link: pick.link,
      template: "Lovely things today",
    }),
  );

  messages.forEach((text, i) => {
    const mine = picks[i];
    const theirs = picks[1 - i];
    assert.ok(text.includes(mine.name), `${mine.name} is missing from its own message`);
    assert.ok(text.includes(mine.link), `${mine.name}'s link is missing`);
    assert.ok(!text.includes(theirs.name), `${theirs.name} leaked into ${mine.name}'s message`);
    assert.ok(!text.includes(theirs.link), `${theirs.name}'s link leaked into ${mine.name}'s`);
  });
});

test("the one message for a batch names no product and carries no link", () => {
  const text = batchShareText("Get {product} for {price} from {shop} — {link}");
  for (const token of ["{product}", "{price}", "{shop}", "{link}"]) {
    assert.ok(!text.includes(token), `${token} survived`);
  }
  assert.ok(!text.includes("http"));
  // Whatever the affiliate wrote around the placeholders is kept.
  assert.ok(text.includes("Get"));
  assert.ok(text.includes("from"));
});

test("a hand-typed link is dropped from a batch message too", () => {
  const text = batchShareText("Shop here https://nickimart.com/r/AAA today");
  assert.ok(!text.includes("nickimart.com"));
  assert.ok(text.includes("Shop here"));
  assert.ok(text.includes("today"));
});

test("a caption that was only placeholders still says something", () => {
  const text = batchShareText("{product} {price} {link}");
  assert.ok(text.length > 10);
  assert.ok(!text.includes("{"));
  assert.equal(batchShareText("   "), batchShareText(""));
});

test("a batched message reads exactly like one shared on its own", () => {
  const input = {
    productName: "Kente throw",
    price: "GH\u20b5240",
    shopName: "Kumasi Weaves",
    link: "https://nickimart.com/r/AAA",
    template: "{product} for {price} \u2014 {link}",
  };
  assert.equal(
    productFlyerShareText(input),
    "Kente throw for GH\u20b5240 \u2014 https://nickimart.com/r/AAA",
  );
});

// ---------------------------------------------------------------------------
// Hit testing — what a finger lands on
// ---------------------------------------------------------------------------

test("hitAt picks the topmost box under a point", () => {
  const hits: FlyerHit[] = [
    {
      id: "frame",
      kind: "frame",
      label: "The picture",
      rect: { x: 0, y: 0, width: 100, height: 100 },
      movable: true,
      resizable: true,
    },
    {
      id: "text:price",
      kind: "text",
      key: "price",
      label: "Price",
      rect: { x: 10, y: 10, width: 30, height: 20 },
      movable: true,
      resizable: true,
    },
  ];

  // Inside both: the one drawn last wins, as it does visually.
  assert.equal(hitAt(hits, 20, 20)?.id, "text:price");
  // Inside only the frame.
  assert.equal(hitAt(hits, 80, 80)?.id, "frame");
  // Outside everything.
  assert.equal(hitAt(hits, 200, 200), null);
  // Edges count: a box you can see is a box you can tap.
  assert.equal(hitAt(hits, 10, 10)?.id, "text:price");
  assert.equal(hitAt(hits, 40, 30)?.id, "text:price");
});

test("a dragged nudge cannot leave what the design can store", () => {
  assert.equal(clampNudge(12.4), 12);
  assert.equal(clampNudge(100_000), NUDGE_LIMIT);
  assert.equal(clampNudge(-100_000), -NUDGE_LIMIT);
  // Round-trips through the resolver unchanged, which is the point of the limit.
  const design = resolveFlyerDesign({
    text: { price: { dx: clampNudge(100_000), dy: clampNudge(-100_000) } },
  });
  assert.equal(design.text.price.dx, NUDGE_LIMIT);
  assert.equal(design.text.price.dy, -NUDGE_LIMIT);
});

test("a pinched size cannot leave what the design can store", () => {
  assert.equal(clampSize(44.6), 45);
  assert.equal(clampSize(0), FLYER_SIZE_RANGE.min);
  assert.equal(clampSize(9999), FLYER_SIZE_RANGE.max);
  const design = resolveFlyerDesign({ text: { name: { size: clampSize(9999) } } });
  assert.equal(design.text.name.size, FLYER_SIZE_RANGE.max);
});

// ---------------------------------------------------------------------------
// Features: deleted, added back, and added twice
// ---------------------------------------------------------------------------

const SAMPLE: ProductFlyerData = {
  name: "Kente throw",
  price: "GH₵240",
  oldPrice: "GH₵300",
  discount: "-20%",
  shopName: "Kumasi Weaves",
  categoryName: "Home",
  message: "Lovely things today",
  link: "nickimart.com/r/AAA",
  sharedBy: "Ama",
  emoji: "🧵",
  gradientFrom: "#fff",
  gradientTo: "#eee",
};

test("an added feature can borrow any of the flyer's own facts", () => {
  const design = DEFAULT_FLYER_DESIGN;
  const words = (source: Parameters<typeof flyerContent>[0]) =>
    flyerContent(source, SAMPLE, design);

  assert.equal(words("price"), "GH₵240");
  assert.equal(words("oldPrice"), "GH₵300");
  assert.equal(words("name"), "Kente throw");
  assert.equal(words("shop"), "Kumasi Weaves");
  assert.equal(words("category"), "Home");
  assert.equal(words("discount"), "-20%");
  assert.equal(words("message"), "Lovely things today");
  assert.equal(words("link"), "nickimart.com/r/AAA");
  assert.equal(words("badge"), design.badge.label);
  assert.equal(words("footerLabel"), "Order on Nickimart");
  assert.equal(words("sharedBy"), "Shared by Ama");
  assert.equal(words("custom"), "");
});

test("a borrowed feature follows the product rather than freezing its words", () => {
  const extra = newFlyerExtra("x1", "price");
  assert.equal(extraWords(extra, SAMPLE, DEFAULT_FLYER_DESIGN), "GH₵240");
  assert.equal(
    extraWords(extra, { ...SAMPLE, price: "GH₵99" }, DEFAULT_FLYER_DESIGN),
    "GH₵99",
  );
});

test("a borrowed feature starts at the size the built-in one uses", () => {
  assert.equal(newFlyerExtra("x1", "price").style.size, DEFAULT_FLYER_DESIGN.text.price.size);
  assert.equal(newFlyerExtra("x2", "name").style.size, DEFAULT_FLYER_DESIGN.text.name.size);
});

test("the same feature can be added more than once", () => {
  const design = resolveFlyerDesign({
    extras: [
      { id: "a", source: "price", slot: "onImage" },
      { id: "b", source: "price", slot: "aboveFooter" },
    ],
  });
  assert.equal(design.extras.length, 2);
  assert.deepEqual(
    design.extras.map((e) => e.source),
    ["price", "price"],
  );
});

test("an empty borrowed feature survives; an empty one of your own does not", () => {
  const design = resolveFlyerDesign({
    extras: [
      { id: "a", source: "price", text: "" },
      { id: "b", source: "custom", text: "   " },
      { id: "c", source: "custom", text: "Free delivery" },
    ],
  });
  assert.deepEqual(
    design.extras.map((e) => e.id),
    ["a", "c"],
  );
});

test("an unknown source falls back to somebody's own words", () => {
  const design = resolveFlyerDesign({
    extras: [{ id: "a", source: "nonsense", text: "Hello" }],
  });
  assert.equal(design.extras[0].source, "custom");
});

test("the flyer carries more added features than it used to", () => {
  assert.ok(MAX_FLYER_EXTRAS >= 12);
  const design = resolveFlyerDesign({
    extras: Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, source: "price" })),
  });
  assert.equal(design.extras.length, MAX_FLYER_EXTRAS);
});

test("the link bar can be switched off and back on", () => {
  assert.equal(DEFAULT_FLYER_DESIGN.footer.visible, true);
  assert.equal(resolveFlyerDesign({ footer: { visible: false } }).footer.visible, false);
  assert.equal(
    resolveFlyerDesign({ footer: { visible: true } }, {
      ...DEFAULT_FLYER_DESIGN,
      footer: { ...DEFAULT_FLYER_DESIGN.footer, visible: false },
    }).footer.visible,
    true,
  );
});
