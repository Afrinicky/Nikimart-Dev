import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentPriceFromRetail,
  commissionOn,
  maxWithdrawal,
  outstandingSetupFee,
  priceAtMarkup,
  round2,
} from "./agent-pricing.ts";
import { normaliseSlugClient } from "./slug.ts";
import { formatMoney, formatPrice } from "../format.ts";

/**
 * The money rules for the sub-agent programme.
 *
 * Each of these is a place where being wrong costs someone real cedis: an agent
 * paid more than they earned, NikiMart funding an agent's discount, or a
 * storefront URL that quietly isn't the one the agent typed.
 *
 * Run with: npm test
 */

test("commission is what the agent charged over their own cost", () => {
  assert.equal(commissionOn(5.5, 4.2), 1.3);
  assert.equal(commissionOn(25, 21), 4);
});

test("an agent selling at cost earns nothing, and can never earn less", () => {
  assert.equal(commissionOn(4.2, 4.2), 0);
  // Below cost shouldn't produce a debt — it produces no commission.
  assert.equal(commissionOn(3, 4.2), 0);
});

test("commission is rounded to the pesewa, not left as float dust", () => {
  // 0.1 + 0.2 territory: the naive subtraction here is 1.2999999999999998.
  assert.equal(commissionOn(5.5, 4.2), 1.3);
  assert.equal(round2(0.1 + 0.2), 0.3);
});

test("a markup prices every bundle above the agent's cost", () => {
  assert.equal(priceAtMarkup(4.2, 20), 5.04);
  assert.equal(priceAtMarkup(21, 0), 21);
  assert.equal(commissionOn(priceAtMarkup(21, 20), 21), 4.2);
});

test("the agent price sits under retail but never under provider cost", () => {
  assert.equal(agentPriceFromRetail(6, 12, 4.2), 5.28);
  // A discount deep enough to go under cost is clamped to cost — selling to an
  // agent below cost would be paying them to sell.
  assert.equal(agentPriceFromRetail(6, 50, 4.2), 4.2);
});

test("a withdrawal is capped by the balance and the fee", () => {
  assert.equal(maxWithdrawal(100, 1), 99);
  // A request already made has already been debited, so what is left of the
  // balance is withdrawable — it must not be held back a second time.
  assert.equal(maxWithdrawal(49, 1), 48);
  // Nothing available never goes negative.
  assert.equal(maxWithdrawal(0.5, 1), 0);
  assert.equal(maxWithdrawal(-30, 1), 0);
});

test("the setup fee shows as outstanding only while the balance is negative", () => {
  // A brand-new agent: charged 30, earned nothing.
  assert.equal(outstandingSetupFee(-30, 30), 30);
  // Halfway cleared by commission.
  assert.equal(outstandingSetupFee(-12.5, 30), 12.5);
  // Cleared, and now earning.
  assert.equal(outstandingSetupFee(15, 30), 0);
  assert.equal(outstandingSetupFee(0, 30), 0);
  // Pushed further negative by an admin debit — the excess isn't setup fee.
  assert.equal(outstandingSetupFee(-80, 30), 30);
});

test("store links are normalised the same way in the browser and on the server", () => {
  assert.equal(normaliseSlugClient("Nickland"), "nickland");
  assert.equal(normaliseSlugClient("  Nick Land Data  "), "nick-land-data");
  assert.equal(normaliseSlugClient("nick@@land"), "nick-land");
  assert.equal(normaliseSlugClient("--nickland--"), "nickland");
  assert.equal(normaliseSlugClient("nick___land"), "nick-land");
});

test("a store link is capped in length, and trailing hyphens never survive", () => {
  const long = normaliseSlugClient("a".repeat(60));
  assert.equal(long.length, 40);
  // A cut that lands on a hyphen would leave an invalid slug behind.
  assert.equal(normaliseSlugClient("nickland-"), "nickland");
});

test("a negative balance shows the minus before the currency, not inside it", () => {
  // A new agent's first screen shows this number, so "GH₵-30" would read as a
  // typo on the one figure they care most about.
  assert.equal(formatPrice(-30), "−GH₵30");
  assert.equal(formatMoney(-30), "−GH₵30.00");
  assert.equal(formatPrice(30), "GH₵30");
  assert.equal(formatMoney(0), "GH₵0.00");
});

test("money in a price list always carries its pesewas", () => {
  assert.equal(formatMoney(5.5), "GH₵5.50");
  assert.equal(formatMoney(10.5), "GH₵10.50");
  assert.equal(formatMoney(26.25), "GH₵26.25");
});
