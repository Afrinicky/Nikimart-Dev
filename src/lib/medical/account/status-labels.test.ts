import assert from "node:assert/strict";
import test from "node:test";
import { QUOTATION_STATUSES, REQUEST_STATUSES } from "../quotations/status.ts";
import {
  ORDER_FULFILMENT_LABELS,
  ORDER_PAYMENT_LABELS,
  QUOTATION_LABELS,
  REQUEST_LABELS,
} from "./status-labels.ts";

test("every request status has customer-facing words", () => {
  for (const status of REQUEST_STATUSES) {
    assert.ok(REQUEST_LABELS[status], `no customer label for ${status}`);
    assert.doesNotMatch(REQUEST_LABELS[status].label, /_|^[A-Z]{2,}$/);
  }
});

test("every quotation status has customer-facing words", () => {
  for (const status of QUOTATION_STATUSES) {
    assert.ok(QUOTATION_LABELS[status], `no customer label for ${status}`);
    assert.doesNotMatch(QUOTATION_LABELS[status].label, /_|^[A-Z]{2,}$/);
  }
});

test("the order vocabularies cover what the schema documents", () => {
  const fulfilment = [
    "PENDING", "CONFIRMED", "PROCESSING", "PARTIALLY_DISPATCHED", "DISPATCHED",
    "DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED",
  ];
  const payment = [
    "UNPAID", "DEPOSIT_PAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "WRITTEN_OFF",
  ];
  for (const status of fulfilment) assert.ok(ORDER_FULFILMENT_LABELS[status], status);
  for (const status of payment) assert.ok(ORDER_PAYMENT_LABELS[status], status);
});

test("nothing tells a customer that a quotation was read by the customer", () => {
  // The console says "Read by customer" for VIEWED, which read back to the
  // customer is nonsense. This is the whole reason the second vocabulary
  // exists, so it is the thing worth asserting.
  for (const entry of Object.values(QUOTATION_LABELS)) {
    assert.doesNotMatch(entry.label, /customer/i);
  }
});
