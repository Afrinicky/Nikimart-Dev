import assert from "node:assert/strict";
import test from "node:test";
import { amountsOnDelivery, balanceAfter, paymentStatusFor } from "./settlement.ts";
import { toPesewas } from "../money.ts";

const noCharges = {
  deliveryCharge: 0,
  handlingCharge: 0,
  otherCharge: 0,
  taxAmount: 0,
  discountAmount: 0,
};

test("goods are what was dispatched, not what was ordered", () => {
  const amounts = amountsOnDelivery(
    [{ quantityDispatched: 15, unitPrice: toPesewas("428.00") }],
    noCharges,
  );
  // 15 × 428, not 40 × 428. Billing for what never left creates a receivable
  // nobody will pay.
  assert.equal(amounts.goods, toPesewas("6420.00"));
  assert.equal(amounts.payable, toPesewas("6420.00"));
});

test("the charges the customer agreed to survive the delivery", () => {
  // The regression this test exists for: the delivery action computed the
  // payable from the goods alone and dropped the delivery charge.
  const amounts = amountsOnDelivery([{ quantityDispatched: 15, unitPrice: toPesewas("428.00") }], {
    ...noCharges,
    deliveryCharge: toPesewas("250.00"),
    handlingCharge: toPesewas("40.00"),
    otherCharge: toPesewas("10.00"),
  });
  assert.equal(amounts.charges, toPesewas("300.00"));
  assert.equal(amounts.revenue, toPesewas("6720.00"));
  assert.equal(amounts.payable, toPesewas("6720.00"));
});

test("a discount reduces the payable and is reported separately", () => {
  const amounts = amountsOnDelivery([{ quantityDispatched: 10, unitPrice: toPesewas("100.00") }], {
    ...noCharges,
    discountAmount: toPesewas("150.00"),
  });
  // Revenue is what was earned; the discount is what was given away. Netting
  // them would hide the second figure, and a report that cannot see it cannot
  // tell a good month from a generous one.
  assert.equal(amounts.revenue, toPesewas("1000.00"));
  assert.equal(amounts.discount, toPesewas("150.00"));
  assert.equal(amounts.payable, toPesewas("850.00"));
});

test("a discount larger than the delivery does not make a negative receivable", () => {
  const amounts = amountsOnDelivery([{ quantityDispatched: 1, unitPrice: toPesewas("20.00") }], {
    ...noCharges,
    discountAmount: toPesewas("500.00"),
  });
  assert.equal(amounts.payable, 0, "a credit is a refund, not a negative balance");
  assert.equal(amounts.discount, toPesewas("500.00"), "and the discount is still reported in full");
});

test("nothing dispatched earns nothing, charges notwithstanding", () => {
  const amounts = amountsOnDelivery([{ quantityDispatched: 0, unitPrice: toPesewas("428.00") }], {
    ...noCharges,
    deliveryCharge: toPesewas("250.00"),
  });
  assert.equal(amounts.goods, 0);
  // The charge still stands on its own: a courier that went out and came back
  // was still paid for.
  assert.equal(amounts.payable, toPesewas("250.00"));
});

test("a fractional quantity cannot creep into a money figure", () => {
  const amounts = amountsOnDelivery(
    [{ quantityDispatched: 2.7 as number, unitPrice: toPesewas("10.00") }],
    noCharges,
  );
  assert.equal(amounts.goods, toPesewas("20.00"), "truncated, because half a kit does not ship");
});

test("several lines add up without a rounding drift", () => {
  const amounts = amountsOnDelivery(
    [
      { quantityDispatched: 3, unitPrice: toPesewas("84.33") },
      { quantityDispatched: 7, unitPrice: toPesewas("12.67") },
      { quantityDispatched: 1, unitPrice: toPesewas("0.01") },
    ],
    noCharges,
  );
  // 252.99 + 88.69 + 0.01
  assert.equal(amounts.goods, toPesewas("341.69"));
});

test("the balance is what is left, and never negative", () => {
  assert.equal(balanceAfter(toPesewas("6670.00"), toPesewas("2000.00")), toPesewas("4670.00"));
  assert.equal(balanceAfter(toPesewas("6670.00"), toPesewas("6670.00")), 0);
  assert.equal(
    balanceAfter(toPesewas("100.00"), toPesewas("150.00")),
    0,
    "an overpayment is money to refund, not a negative balance",
  );
});

test("payment status is derived, not chosen", () => {
  assert.equal(paymentStatusFor(toPesewas("100.00"), 0), "UNPAID");
  assert.equal(paymentStatusFor(toPesewas("100.00"), toPesewas("0.01")), "PARTIALLY_PAID");
  assert.equal(paymentStatusFor(toPesewas("100.00"), toPesewas("99.99")), "PARTIALLY_PAID");
  assert.equal(paymentStatusFor(toPesewas("100.00"), toPesewas("100.00")), "PAID");
  assert.equal(
    paymentStatusFor(toPesewas("100.00"), toPesewas("120.00")),
    "PAID",
    "more than enough is still paid",
  );
});
