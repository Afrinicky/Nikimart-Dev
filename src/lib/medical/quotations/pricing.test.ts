import assert from "node:assert/strict";
import test from "node:test";
import { marginOf, priceDocument, priceLine } from "./pricing.ts";
import { percentToBasisPoints, toPesewas } from "../money.ts";

const bare = {
  discountKind: "NONE" as const,
  discountValue: 0,
  deliveryCharge: 0,
  handlingCharge: 0,
  otherCharge: 0,
  taxRate: 0,
  planUpliftRate: 0,
  depositRate: 0,
};

const line = (quantity: number, price: string) => ({
  quantity,
  unitPrice: toPesewas(price),
  discountKind: "NONE" as const,
  discountValue: 0,
});

test("a line is quantity times price", () => {
  const priced = priceLine(line(12, "84.50"));
  assert.equal(priced.gross, toPesewas("1014.00"));
  assert.equal(priced.discount, 0);
  assert.equal(priced.total, toPesewas("1014.00"));
});

test("a percentage discount on a line", () => {
  const priced = priceLine({
    ...line(10, "100.00"),
    discountKind: "PERCENT",
    discountValue: percentToBasisPoints("12.5"),
  });
  assert.equal(priced.discount, toPesewas("125.00"));
  assert.equal(priced.total, toPesewas("875.00"));
});

test("a discount larger than the line does not create credit", () => {
  const priced = priceLine({
    ...line(1, "20.00"),
    discountKind: "AMOUNT",
    discountValue: toPesewas("500.00"),
  });
  assert.equal(priced.total, 0, "the line floors at zero");
  assert.equal(
    priced.discount,
    toPesewas("20.00"),
    "and the discount is what was given, not what was typed",
  );
});

test("a fractional quantity cannot creep into a money figure", () => {
  const priced = priceLine({ ...line(2.9, "10.00") });
  assert.equal(priced.gross, toPesewas("20.00"), "truncated — half a pack does not ship");
});

test("the document discount applies after the line discounts, never before", () => {
  // The classic double-count: 10% off each line and then 10% off the gross
  // would take 19%, which is not what either party agreed.
  const amounts = priceDocument({
    ...bare,
    lines: [
      { ...line(10, "100.00"), discountKind: "PERCENT", discountValue: percentToBasisPoints("10") },
    ],
    discountKind: "PERCENT",
    discountValue: percentToBasisPoints("10"),
  });
  assert.equal(amounts.subtotal, toPesewas("900.00"), "the line discount first");
  assert.equal(amounts.discountAmount, toPesewas("90.00"), "then 10% of the discounted subtotal");
  assert.equal(amounts.totalOutright, toPesewas("810.00"));
});

test("charges are added and never discounted", () => {
  // A discount on the goods is not a discount on getting them there: the
  // courier costs what it costs.
  const amounts = priceDocument({
    ...bare,
    lines: [line(1, "1000.00")],
    discountKind: "PERCENT",
    discountValue: percentToBasisPoints("50"),
    deliveryCharge: toPesewas("250.00"),
    handlingCharge: toPesewas("50.00"),
  });
  assert.equal(amounts.discountAmount, toPesewas("500.00"));
  assert.equal(amounts.charges, toPesewas("300.00"));
  assert.equal(amounts.totalOutright, toPesewas("800.00"));
});

test("tax is charged after the discount, not before it", () => {
  // Taxing the undiscounted figure charges the customer for money they were
  // never asked for.
  const amounts = priceDocument({
    ...bare,
    lines: [line(1, "1000.00")],
    discountKind: "AMOUNT",
    discountValue: toPesewas("200.00"),
    taxRate: percentToBasisPoints("15"),
  });
  assert.equal(amounts.taxableAmount, toPesewas("800.00"));
  assert.equal(amounts.taxAmount, toPesewas("120.00"));
  assert.equal(amounts.totalOutright, toPesewas("920.00"));
});

test("no tax rate means no tax line, and that is the default", () => {
  // Nothing in this system assumes a rate. Ghana's VAT, NHIL and GETFund
  // cannot be expressed as one, and a guess would put a wrong figure on a
  // customer's document.
  const amounts = priceDocument({ ...bare, lines: [line(1, "1000.00")] });
  assert.equal(amounts.taxAmount, 0);
  assert.equal(amounts.totalOutright, toPesewas("1000.00"));
});

test("a discount larger than the subtotal does not make the document negative", () => {
  const amounts = priceDocument({
    ...bare,
    lines: [line(1, "100.00")],
    discountKind: "AMOUNT",
    discountValue: toPesewas("900.00"),
    deliveryCharge: toPesewas("20.00"),
  });
  assert.equal(amounts.discountAmount, toPesewas("100.00"), "capped at the subtotal");
  assert.equal(amounts.totalOutright, toPesewas("20.00"), "the delivery charge still stands");
});

test("an instalment uplift sits on top of the outright total", () => {
  const amounts = priceDocument({
    ...bare,
    lines: [line(1, "10000.00")],
    planUpliftRate: percentToBasisPoints("8"),
    depositRate: percentToBasisPoints("30"),
  });
  assert.equal(amounts.totalOutright, toPesewas("10000.00"));
  assert.equal(amounts.planUpliftAmount, toPesewas("800.00"));
  assert.equal(amounts.totalPayable, toPesewas("10800.00"));
  assert.equal(amounts.depositAmount, toPesewas("3240.00"), "30% of the payable, not of the goods");
  assert.equal(amounts.balanceAfterDeposit, toPesewas("7560.00"));
  assert.equal(
    amounts.depositAmount + amounts.balanceAfterDeposit,
    amounts.totalPayable,
    "the parts add back to the whole",
  );
});

test("several lines add up without a rounding drift", () => {
  const amounts = priceDocument({
    ...bare,
    lines: [line(3, "84.33"), line(7, "12.67"), line(1, "0.01")],
  });
  // 252.99 + 88.69 + 0.01
  assert.equal(amounts.subtotal, toPesewas("341.69"));
});

test("a percentage discount on the sum equals the same discount on the lines", () => {
  // The property that matters: whichever way a salesperson expresses it, the
  // customer sees the same figure.
  const lines = [line(3, "84.33"), line(7, "12.67"), line(5, "19.99")];
  const onDocument = priceDocument({
    ...bare,
    lines,
    discountKind: "PERCENT",
    discountValue: percentToBasisPoints("10"),
  });
  const onLines = priceDocument({
    ...bare,
    lines: lines.map((l) => ({
      ...l,
      discountKind: "PERCENT" as const,
      discountValue: percentToBasisPoints("10"),
    })),
  });
  // Within one pesewa: rounding each line separately cannot match rounding the
  // sum exactly, and the test says which is bigger rather than pretending they
  // are identical.
  assert.ok(
    Math.abs(onDocument.totalOutright - onLines.totalOutright) <= 1,
    `${onDocument.totalOutright} vs ${onLines.totalOutright}`,
  );
});

test("an empty document is zero, not an error", () => {
  const amounts = priceDocument({ ...bare, lines: [] });
  assert.equal(amounts.subtotal, 0);
  assert.equal(amounts.totalPayable, 0);
  assert.deepEqual(amounts.lines, []);
});

test("margin is on revenue, not mark-up on cost", () => {
  const margin = marginOf([
    { quantity: 10, unitCost: toPesewas("60.00"), total: toPesewas("1000.00") },
  ]);
  assert.ok(margin);
  assert.equal(margin.cost, toPesewas("600.00"));
  assert.equal(margin.profit, toPesewas("400.00"));
  // 40% of revenue. The mark-up on cost would be 66.7%, and quoting that as
  // the margin overstates what the business makes.
  assert.equal(margin.rate, 4000);
});

test("no cost means no margin, rather than a margin of 100%", () => {
  // The most confidently wrong figure a report can show.
  assert.equal(
    marginOf([{ quantity: 1, unitCost: 0, total: toPesewas("500.00") }]),
    null,
  );
});
