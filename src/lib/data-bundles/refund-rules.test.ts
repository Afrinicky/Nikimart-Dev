import test from "node:test";
import assert from "node:assert/strict";
import {
  canRecreditOrder,
  canRefundOrder,
  canReorderOrder,
  isLiveWithProvider,
  normaliseMomoPhone,
  refundDestinationFor,
} from "./refund-rules.ts";

/**
 * The rules a refund is decided by.
 *
 * These exist because the two halves of the old refund disagreed in silence.
 * A queued order credited the agent's wallet; a failed one flipped a status
 * and moved nothing, and both said "done". So the cases below are the bug
 * itself, written down: every state an order can be stranded in has to be
 * refundable, and no browser may choose where the cedis go.
 *
 * Run with: npm test
 */

test("every state short of delivered or already-refunded can be refunded", () => {
  for (const status of ["pending", "paid", "queued", "processing", "failed"]) {
    assert.equal(canRefundOrder(status), true, status);
  }
});

test("a delivered or refunded order cannot be refunded", () => {
  assert.equal(canRefundOrder("completed"), false);
  assert.equal(canRefundOrder("refunded"), false);
});

test("a failed order is refundable — the case that used to move no money", () => {
  assert.equal(canRefundOrder("failed"), true);
});

test("an order stranded by a dispatch that never started is refundable", () => {
  // A re-order flips a failed order to "paid" before dispatching it; a
  // dispatch that cannot start leaves it there. Nothing could refund that.
  assert.equal(canRefundOrder("paid"), true);
  assert.equal(canRefundOrder("processing"), true);
});

test("an agent cannot refund an order the provider is delivering now", () => {
  // They cannot see the provider's own message on the order, and a bundle that
  // lands anyway would leave the customer with the data and the money both.
  assert.equal(canRefundOrder("processing", false), false);
  assert.equal(canRefundOrder("processing", true), true);
});

test("an agent may still refund every other stranded state", () => {
  for (const status of ["pending", "paid", "queued", "failed"]) {
    assert.equal(canRefundOrder(status, false), true, status);
  }
});

test("only queued and processing need the provider asked first", () => {
  assert.equal(isLiveWithProvider("queued"), true);
  assert.equal(isLiveWithProvider("processing"), true);
  assert.equal(isLiveWithProvider("failed"), false);
  assert.equal(isLiveWithProvider("paid"), false);
});

test("a bundle can only be sent to another number once it is paid for", () => {
  assert.equal(canRecreditOrder("queued", "paid"), true);
  assert.equal(canRecreditOrder("failed", "paid"), true);
  assert.equal(canRecreditOrder("queued", "unpaid"), false);
});

test("an order already with the provider is not re-credited behind its back", () => {
  assert.equal(canRecreditOrder("processing", "paid"), false);
  assert.equal(canRecreditOrder("completed", "paid"), false);
});

test("re-ordering is refused while the provider still holds the order", () => {
  assert.equal(canReorderOrder("queued", "paid"), false);
  assert.equal(canReorderOrder("processing", "paid"), false);
});

test("re-ordering covers both of the buttons it replaced", () => {
  // "Send to provider" — paid for, never handed over.
  assert.equal(canReorderOrder("paid", "paid"), true);
  // "Order again" — handed over, and failed.
  assert.equal(canReorderOrder("failed", "paid"), true);
});

test("nothing is re-ordered before the money is in", () => {
  assert.equal(canReorderOrder("failed", "unpaid"), false);
  assert.equal(canReorderOrder("completed", "paid"), false);
  assert.equal(canReorderOrder("refunded", "paid"), false);
});

test("an agent's refund always lands in their own wallet", () => {
  assert.equal(
    refundDestinationFor({ byAdmin: false, hasAgent: true, requested: "BUYER_MOMO" }),
    "WALLET",
  );
});

test("an admin may choose either destination on an agent sale", () => {
  assert.equal(
    refundDestinationFor({ byAdmin: true, hasAgent: true, requested: "BUYER_MOMO" }),
    "BUYER_MOMO",
  );
  assert.equal(
    refundDestinationFor({ byAdmin: true, hasAgent: true, requested: "WALLET" }),
    "WALLET",
  );
});

test("a house sale has no wallet, so it can only go back to the buyer", () => {
  assert.equal(
    refundDestinationFor({ byAdmin: true, hasAgent: false, requested: "WALLET" }),
    "BUYER_MOMO",
  );
});

test("an unstated destination defaults to the wallet, never to money leaving", () => {
  assert.equal(refundDestinationFor({ byAdmin: true, hasAgent: true }), "WALLET");
});

test("mobile money numbers are read in the forms people type them", () => {
  assert.equal(normaliseMomoPhone("0241234567"), "0241234567");
  assert.equal(normaliseMomoPhone("024 123 4567"), "0241234567");
  assert.equal(normaliseMomoPhone("+233241234567"), "0241234567");
  assert.equal(normaliseMomoPhone("233241234567"), "0241234567");
});

test("anything that is not a Ghana number is refused rather than guessed at", () => {
  assert.equal(normaliseMomoPhone("24123456"), null);
  assert.equal(normaliseMomoPhone("12345678901"), null);
  assert.equal(normaliseMomoPhone(""), null);
  assert.equal(normaliseMomoPhone(null), null);
});
