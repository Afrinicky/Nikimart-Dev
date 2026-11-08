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

test("every state the provider will still let go of can be refunded", () => {
  for (const status of ["pending", "queued", "failed"]) {
    assert.equal(canRefundOrder(status), true, status);
  }
});

test("a delivered or refunded order cannot be refunded", () => {
  assert.equal(canRefundOrder("completed"), false);
  assert.equal(canRefundOrder("refunded"), false);
});

test("nothing that reads PROCESSING can be refunded", () => {
  // The provider offers no cancellation once it has started: queued is
  // "accepted, not started", processing is "started". A refund button there
  // promises something nobody upstream can honour, and risks the bundle
  // landing anyway — the customer keeping the data and the money both.
  //
  // `paid` goes with it because the console shows the two as one word. A
  // refund on one pill and not on an identical pill beside it is a console
  // nobody can trust, whatever the state underneath happens to be.
  assert.equal(canRefundOrder("processing"), false);
  assert.equal(canRefundOrder("paid"), false);
  assert.equal(canRefundOrder("queued"), true);
});

test("a failed order is refundable — the case that used to move no money", () => {
  assert.equal(canRefundOrder("failed"), true);
});

test("an order the dispatcher never got to is re-ordered, not refunded", () => {
  // "paid" means the provider has never heard of it, so there is nothing to
  // cancel and nothing to refund around: re-order is the way out, and if the
  // provider will not take it the order lands on "failed", which is.
  assert.equal(canRefundOrder("paid"), false);
  assert.equal(canReorderOrder("paid", "paid", false), true);
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
  assert.equal(canReorderOrder("queued", "paid", true), false);
  assert.equal(canReorderOrder("processing", "paid", true), false);
});

test("a processing order the provider never heard of can still be re-ordered", () => {
  // The dispatcher marks the row processing before it calls out, so a call
  // that never returned leaves an order with no upstream reference. It cannot
  // be cancelled and cannot be refreshed, so this is its only way out.
  assert.equal(canReorderOrder("processing", "paid", false), true);
});

test("re-ordering covers both of the buttons it replaced", () => {
  // "Send to provider" — paid for, never handed over.
  assert.equal(canReorderOrder("paid", "paid", false), true);
  // "Order again" — handed over, and failed.
  assert.equal(canReorderOrder("failed", "paid", true), true);
});

test("nothing is re-ordered before the money is in", () => {
  assert.equal(canReorderOrder("failed", "unpaid", true), false);
  assert.equal(canReorderOrder("completed", "paid", true), false);
  assert.equal(canReorderOrder("refunded", "paid", true), false);
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
