import assert from "node:assert/strict";
import test from "node:test";
import {
  formatLeadTime,
  primaryActionLabel,
  PURCHASE_MODE_BLURBS,
  PURCHASE_MODE_LABELS,
  PURCHASE_MODES,
  purchaseNote,
  purchaseOptions,
} from "./purchase-mode.ts";

type Availability = Parameters<typeof purchaseOptions>[0]["availability"];
const inStock = { kind: "IN_STOCK" } as Availability;
const lowStock = { kind: "LOW_STOCK" } as Availability;
const toOrder = { kind: "TO_ORDER" } as Availability;
const outOfStock = { kind: "OUT_OF_STOCK" } as Availability;

type Mode = Parameters<typeof purchaseOptions>[0]["purchaseMode"];
const product = (
  purchaseMode: Mode,
  availability: Availability,
  restrictedSale = false,
) => ({ purchaseMode, availability, restrictedSale });

test("CHECKOUT in stock is a cart, and nothing is blocked", () => {
  const o = purchaseOptions(product("CHECKOUT", inStock));
  assert.equal(o.canCheckout, true);
  assert.equal(o.primary, "CHECKOUT");
  assert.equal(o.checkoutBlockedBecause, null);
  assert.equal(primaryActionLabel(o), "Add to cart");
  assert.equal(purchaseNote(o, inStock), null, "no sentence where none is needed");
});

test("QUOTATION never offers a cart, however much stock there is", () => {
  const o = purchaseOptions(product("QUOTATION", inStock));
  assert.equal(o.canCheckout, false);
  assert.equal(o.canQuote, true);
  assert.equal(o.primary, "QUOTATION");
  assert.equal(primaryActionLabel(o), "Add to quotation");
});

test("the note never contradicts the price printed above it", () => {
  const o = purchaseOptions(product("QUOTATION", inStock));

  // No listed price: "on request" is the whole truth.
  assert.equal(purchaseNote(o, inStock, 0), "Priced on request.");

  // A listed price: saying "priced on request" directly beneath GH₵8,450 is a
  // contradiction, and the first thing a customer then distrusts is the price.
  const withPrice = purchaseNote(o, inStock, 845_000) ?? "";
  assert.doesNotMatch(withPrice, /Priced on request/);
  assert.match(withPrice, /indicative/);

  const toOrderWithPrice = purchaseNote(purchaseOptions(product("QUOTATION", toOrder)), toOrder, 845_000) ?? "";
  assert.match(toOrderWithPrice, /Brought in to order/);
  assert.match(toOrderWithPrice, /indicative/);
});

test("BOTH offers both, with the cart leading", () => {
  const o = purchaseOptions(product("BOTH", inStock));
  assert.equal(o.canCheckout, true);
  assert.equal(o.canQuote, true);
  assert.equal(o.primary, "CHECKOUT", "a customer who can buy now should not have to ask");
});

test("a restricted line is quotation-only whatever its mode says", () => {
  for (const mode of ["CHECKOUT", "BOTH"] as const) {
    const o = purchaseOptions(product(mode, inStock, true));
    assert.equal(o.canCheckout, false, mode);
    assert.equal(o.canQuote, true, mode);
    assert.equal(o.checkoutBlockedBecause, "RESTRICTED", mode);
    assert.match(purchaseNote(o, inStock, 845_000) ?? "", /licensed institutions/);
  }
});

test("out of stock blocks the cart and keeps the quotation", () => {
  const o = purchaseOptions(product("CHECKOUT", outOfStock));
  assert.equal(o.canCheckout, false);
  assert.equal(
    o.canQuote,
    true,
    "'we would like 40, when can you get them' is the most valuable message this business receives",
  );
  assert.equal(o.primary, "QUOTATION");
  assert.equal(o.checkoutBlockedBecause, "OUT_OF_STOCK");
  assert.match(purchaseNote(o, outOfStock, 845_000) ?? "", /when we can supply/);
});

test("low stock still sells", () => {
  const o = purchaseOptions(product("BOTH", lowStock));
  assert.equal(o.canCheckout, true, "one box left is still a box that can be bought");
});

test("a to-order line checks out when its mode allows it", () => {
  const sellable = purchaseOptions(product("CHECKOUT", toOrder));
  assert.equal(sellable.canCheckout, true, "the lead time on the page already says a fortnight");

  const quoted = purchaseOptions(product("QUOTATION", toOrder));
  assert.equal(quoted.canCheckout, false);
  assert.match(purchaseNote(quoted, toOrder, 845_000) ?? "", /Brought in to order/);
  // With no price at all there is nothing to call indicative.
  assert.equal(purchaseNote(quoted, toOrder, 0), "Priced on request.");
});

test("every combination leaves the customer something to do", () => {
  const modes = ["CHECKOUT", "QUOTATION", "BOTH"] as const;
  const states = [inStock, lowStock, toOrder, outOfStock];
  for (const mode of modes) {
    for (const availability of states) {
      for (const restricted of [false, true]) {
        const o = purchaseOptions(product(mode, availability, restricted));
        assert.notEqual(
          o.primary,
          null,
          `${mode}/${availability.kind}/${restricted} left a dead end`,
        );
        assert.ok(o.canCheckout || o.canQuote);
        // A blocked reason is only ever given where a cart was actually on
        // offer; on a quotation-only line there is no missing button to explain.
        if (o.checkoutBlockedBecause !== null) {
          assert.notEqual(mode, "QUOTATION");
        }
      }
    }
  }
});

test("lead time reads as a person would say it", () => {
  assert.equal(formatLeadTime({ min: 2, max: 7 }), "2–7 working days");
  assert.equal(formatLeadTime({ min: 3, max: 3 }), "3 working days");
  assert.equal(formatLeadTime({ min: 1, max: 1 }), "1 working day");
  assert.equal(formatLeadTime({ min: 0, max: 0 }), "Lead time on request");
});

test("the modes as a value match the modes as a type", () => {
  // The list a form iterates and the list an action validates against are the
  // same list. A fourth mode added to the type without being added here would
  // be offered nowhere and rejected everywhere, and this is what catches it.
  assert.deepEqual([...PURCHASE_MODES], ["CHECKOUT", "QUOTATION", "BOTH"]);
  for (const mode of PURCHASE_MODES) {
    assert.equal(typeof PURCHASE_MODE_LABELS[mode], "string", mode);
    assert.ok(PURCHASE_MODE_BLURBS[mode].length > 0, mode);
  }
});
