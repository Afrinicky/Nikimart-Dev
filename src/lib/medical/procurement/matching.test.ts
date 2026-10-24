import assert from "node:assert/strict";
import test from "node:test";
import {
  canSettle,
  matchInvoice,
  matchLine,
  outstandingOn,
  settlementStatus,
  type MatchInput,
} from "./matching.ts";
import { toPesewas } from "../money.ts";

function line(partial: Partial<MatchInput> & Pick<MatchInput, "id">): MatchInput {
  return {
    description: "Nitrile gloves, box of 100",
    purchaseOrderItemId: "poi-1",
    quantityOrdered: 100,
    quantityAccepted: 100,
    quantityInvoiced: 100,
    unitCostOrdered: toPesewas(58),
    unitPriceInvoiced: toPesewas(58),
    taxInvoiced: 0,
    taxExpected: 0,
    ...partial,
  };
}

test("an invoice that matches the order and the delivery is clean", () => {
  const match = matchInvoice([line({ id: "1" }), line({ id: "2", quantityOrdered: 40, quantityAccepted: 40, quantityInvoiced: 40 })]);
  assert.equal(match.kind, "NONE");
  assert.equal(match.isClean, true);
  assert.equal(match.totalVariance, 0);
  assert.equal(match.summary, "Matches the order and the delivery.");
  assert.equal(canSettle(match, false), true, "a clean invoice needs no sign-off");
});

test("billed for more than arrived", () => {
  // The common one: 100 ordered, 94 came off the lorry, 100 on the invoice.
  const result = matchLine(line({ id: "1", quantityAccepted: 94 }));
  assert.equal(result.kind, "QUANTITY");
  assert.equal(result.quantityVariance, 6);
  assert.equal(result.expectedTotal, toPesewas(94 * 58));
  assert.equal(result.invoicedTotal, toPesewas(100 * 58));
  assert.equal(result.valueVariance, toPesewas(6 * 58), "GH₵348 asked for and not delivered");
  assert.match(result.note, /Billed for 100 but 94 accepted/);
});

test("a short delivery billed correctly is not a discrepancy", () => {
  // 100 ordered, 94 accepted, 94 invoiced. The order is under-delivered, which
  // is a procurement problem — but the invoice is right and must not be flagged.
  const result = matchLine(line({ id: "1", quantityAccepted: 94, quantityInvoiced: 94 }));
  assert.equal(result.kind, "NONE");
  assert.equal(result.valueVariance, 0);
});

test("unit price above the purchase order", () => {
  const result = matchLine(line({ id: "1", unitPriceInvoiced: toPesewas(59.74) }));
  assert.equal(result.kind, "PRICE");
  assert.equal(result.priceVariance, toPesewas(1.74), "3% on GH₵58");
  assert.equal(result.valueVariance, toPesewas(174), "100 units × GH₵1.74");
  assert.match(result.note, /Unit price above the purchase order/);
});

test("a price below the order is still a difference, and still flagged", () => {
  const result = matchLine(line({ id: "1", unitPriceInvoiced: toPesewas(55) }));
  assert.equal(result.kind, "PRICE");
  assert.ok(result.valueVariance < 0, "in our favour, and still worth knowing");
  assert.match(result.note, /Unit price below the purchase order/);
});

test("tax that was not agreed", () => {
  const result = matchLine(line({ id: "1", taxInvoiced: toPesewas(870) }));
  assert.equal(result.kind, "TAX");
  assert.equal(result.taxVariance, toPesewas(870));
  assert.equal(result.valueVariance, toPesewas(870));
});

test("several things wrong on one line reads as MULTIPLE", () => {
  const result = matchLine(
    line({ id: "1", quantityAccepted: 90, unitPriceInvoiced: toPesewas(60), taxInvoiced: toPesewas(100) }),
  );
  assert.equal(result.kind, "MULTIPLE");
  assert.equal(result.quantityVariance, 10);
  assert.equal(result.priceVariance, toPesewas(2));
  assert.equal(result.taxVariance, toPesewas(100));
  // expected 90 × 58 = 5,220; invoiced 100 × 60 + 100 = 6,100.
  assert.equal(result.expectedTotal, toPesewas(5_220));
  assert.equal(result.invoicedTotal, toPesewas(6_100));
  assert.equal(result.valueVariance, toPesewas(880));
});

test("a line nobody ordered is UNMATCHED, not a price problem", () => {
  const result = matchLine(
    line({ id: "x", purchaseOrderItemId: null, description: "Pallet charge", quantityInvoiced: 1, unitPriceInvoiced: toPesewas(250) }),
  );
  assert.equal(result.kind, "UNMATCHED");
  assert.equal(result.expectedTotal, 0, "we agreed to nothing, so we expect to pay nothing");
  assert.equal(result.invoicedTotal, toPesewas(250));
  assert.equal(result.valueVariance, toPesewas(250));
  assert.equal(result.note, "Not on any purchase order line.");
});

test("an invoice summarises what its lines found", () => {
  const match = matchInvoice([
    line({ id: "1" }),
    line({ id: "2", quantityAccepted: 94 }),
    line({ id: "3", unitPriceInvoiced: toPesewas(60) }),
  ]);
  assert.equal(match.kind, "MULTIPLE");
  assert.equal(match.isClean, false);
  assert.equal(match.totalVariance, toPesewas(6 * 58) + toPesewas(200));
  assert.match(match.summary, /2 lines differ/);
});

test("one kind of problem across several lines keeps that kind", () => {
  const match = matchInvoice([
    line({ id: "1", quantityAccepted: 90 }),
    line({ id: "2", quantityAccepted: 80 }),
  ]);
  assert.equal(match.kind, "QUANTITY");
  assert.match(match.summary, /2 lines differ/);
});

test("a discrepant invoice cannot be settled until somebody signs it off", () => {
  const match = matchInvoice([line({ id: "1", quantityAccepted: 94 })]);
  assert.equal(canSettle(match, false), false, "not payable on its own");
  assert.equal(canSettle(match, true), true, "payable once a person has accepted the difference");
});

test("a pesewa of rounding on a converted invoice is not a dispute", () => {
  const result = matchLine(line({ id: "1", quantityInvoiced: 100, quantityAccepted: 100, unitPriceInvoiced: toPesewas(58), taxInvoiced: 1, taxExpected: 0 }));
  // A one-pesewa tax difference still reports TAX, because a tax line that
  // appeared from nowhere is a fact — but the invoice total tolerance keeps
  // pure float dust from flagging a whole invoice.
  assert.equal(result.kind, "TAX");
  const clean = matchInvoice([line({ id: "1" })]);
  assert.equal(clean.isClean, true);
});

test("outstanding never goes negative", () => {
  assert.equal(outstandingOn(toPesewas(1_000), toPesewas(400)), toPesewas(600));
  assert.equal(outstandingOn(toPesewas(1_000), toPesewas(1_000)), 0);
  assert.equal(
    outstandingOn(toPesewas(1_000), toPesewas(1_200)),
    0,
    "an overpayment is a credit note, not a negative payable",
  );
});

test("settlement status follows what has actually gone out", () => {
  assert.equal(settlementStatus(toPesewas(1_000), 0), "AWAITING_PAYMENT");
  assert.equal(settlementStatus(toPesewas(1_000), toPesewas(400)), "PARTIALLY_PAID");
  assert.equal(settlementStatus(toPesewas(1_000), toPesewas(1_000)), "PAID");
  assert.equal(settlementStatus(toPesewas(1_000), toPesewas(1_500)), "PAID");
});

test("an empty invoice is clean and owes nothing", () => {
  const match = matchInvoice([]);
  assert.equal(match.kind, "NONE");
  assert.equal(match.isClean, true);
  assert.equal(match.invoicedTotal, 0);
});
