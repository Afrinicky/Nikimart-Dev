import test from "node:test";
import assert from "node:assert/strict";
import {
  canChoosePaymentMethod,
  normalisePaymentMode,
  programPaymentMode,
  resolveRecruitPaymentMode,
  settleMethodFor,
} from "./payment-mode.ts";

/**
 * The chain of command over how a registration fee is collected.
 *
 * Three voices — the programme, one agent's exception, the person registering
 * — and getting the order wrong means a setting an admin changed does nothing,
 * or a browser deciding what Nickimart collects. Both are silent until
 * somebody notices money is not arriving.
 *
 * Run with: npm test
 */

test("an agent with no exception follows the programme", () => {
  for (const programMode of ["UPFRONT", "COMMISSION", "BOTH"] as const) {
    assert.equal(
      resolveRecruitPaymentMode({ programMode, agentMode: null, perAgentOverrides: true }),
      programMode,
    );
  }
});

test("an agent's exception outranks the programme where exceptions are allowed", () => {
  assert.equal(
    resolveRecruitPaymentMode({
      programMode: "UPFRONT",
      agentMode: "COMMISSION",
      perAgentOverrides: true,
    }),
    "COMMISSION",
  );
});

test("switching exceptions off puts everyone back on the programme without unpicking them", () => {
  // The exception is still on the row — it is simply not heard, so turning
  // the switch back on restores it.
  assert.equal(
    resolveRecruitPaymentMode({
      programMode: "UPFRONT",
      agentMode: "COMMISSION",
      perAgentOverrides: false,
    }),
    "UPFRONT",
  );
});

test("an unreadable exception is no exception at all", () => {
  assert.equal(
    resolveRecruitPaymentMode({
      programMode: "COMMISSION",
      agentMode: "whatever",
      perAgentOverrides: true,
    }),
    "COMMISSION",
  );
  assert.equal(normalisePaymentMode("  upfront "), "UPFRONT");
  assert.equal(normalisePaymentMode(""), null);
  assert.equal(programPaymentMode(null), "BOTH");
});

test("the browser does not get a vote outside what the mode allows", () => {
  // Posting BALANCE into an up-front arrangement is corrected, not honoured.
  assert.equal(settleMethodFor("UPFRONT", "BALANCE", 50), "UPFRONT");
  assert.equal(settleMethodFor("COMMISSION", "UPFRONT", 50), "BALANCE");
  // Only BOTH hands the decision over.
  assert.equal(settleMethodFor("BOTH", "UPFRONT", 50), "UPFRONT");
  assert.equal(settleMethodFor("BOTH", "BALANCE", 50), "BALANCE");
  assert.equal(settleMethodFor("BOTH", undefined, 50), "BALANCE");
});

test("a fee of zero is never collected up front, whatever the mode says", () => {
  assert.equal(settleMethodFor("UPFRONT", "UPFRONT", 0), "BALANCE");
  assert.equal(canChoosePaymentMethod("BOTH", 0), false);
  assert.equal(canChoosePaymentMethod("BOTH", 50), true);
  assert.equal(canChoosePaymentMethod("UPFRONT", 50), false);
});
