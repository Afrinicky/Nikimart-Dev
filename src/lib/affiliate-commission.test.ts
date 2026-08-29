import { test } from "node:test";
import assert from "node:assert/strict";
import {
  affiliateLineCommission,
  maxPlatformFundedRate,
  maxSellerFundedRate,
  resolveAffiliateRate,
} from "./affiliate-commission.ts";

/**
 * The affiliate programme's money rules, pinned down.
 *
 * The half-of-platform-commission cap on Nickimart-funded enrolments is a hard
 * business constraint, and the seller-funded path deliberately has no such cap
 * (a seller may offer whatever they like out of their own margin). Both are
 * easy to erode by accident, hence these.
 *
 * Run with: npm test
 */

const base = {
  categoryAffiliateRate: null,
  defaultAffiliateRate: 5,
  platformCommissionRate: 10,
};

test("a product that isn't enrolled never earns commission", () => {
  const result = resolveAffiliateRate({
    ...base,
    affiliateEnabled: false,
    affiliateEnrolledBy: "seller",
    affiliateCommissionRate: 20,
  });
  assert.equal(result.rate, 0);
  assert.equal(result.fundedBy, "");
});

test("an enrolment with no funder recorded earns nothing", () => {
  const result = resolveAffiliateRate({
    ...base,
    affiliateEnabled: true,
    affiliateEnrolledBy: "",
    affiliateCommissionRate: 20,
  });
  assert.equal(result.rate, 0);
});

test("a seller's own rate is honoured in full, even above the platform's cut", () => {
  const result = resolveAffiliateRate({
    ...base,
    affiliateEnabled: true,
    affiliateEnrolledBy: "seller",
    affiliateCommissionRate: 20,
  });
  assert.deepEqual(result, { rate: 20, fundedBy: "seller", requestedRate: 20, capped: false });
});

test("a Nickimart-funded enrolment is capped at half the platform commission", () => {
  const result = resolveAffiliateRate({
    ...base,
    affiliateEnabled: true,
    affiliateEnrolledBy: "admin",
    affiliateCommissionRate: 20,
  });
  assert.deepEqual(result, { rate: 5, fundedBy: "platform", requestedRate: 20, capped: true });
});

test("a Nickimart-funded enrolment under the cap is left alone", () => {
  const result = resolveAffiliateRate({
    ...base,
    affiliateEnabled: true,
    affiliateEnrolledBy: "admin",
    affiliateCommissionRate: 3,
  });
  assert.deepEqual(result, { rate: 3, fundedBy: "platform", requestedRate: 3, capped: false });
});

test("the cap tracks the commission actually charged on the item", () => {
  assert.equal(maxPlatformFundedRate(25), 12.5);
  assert.equal(maxPlatformFundedRate(7), 3.5);
  assert.equal(maxPlatformFundedRate(0), 0);
});

test("a blank product rate inherits the category rate, then the default", () => {
  const fromCategory = resolveAffiliateRate({
    ...base,
    categoryAffiliateRate: 8,
    affiliateEnabled: true,
    affiliateEnrolledBy: "seller",
    affiliateCommissionRate: null,
  });
  assert.equal(fromCategory.rate, 8);

  const fromDefault = resolveAffiliateRate({
    ...base,
    affiliateEnabled: true,
    affiliateEnrolledBy: "seller",
    affiliateCommissionRate: null,
  });
  assert.equal(fromDefault.rate, 5);
});

test("an inherited rate is still capped for Nickimart-funded enrolments", () => {
  const result = resolveAffiliateRate({
    ...base,
    categoryAffiliateRate: 8,
    affiliateEnabled: true,
    affiliateEnrolledBy: "admin",
    affiliateCommissionRate: null,
  });
  assert.equal(result.rate, 5);
  assert.equal(result.capped, true);
});

test("a seller can never be pushed into paying to make a sale", () => {
  const result = resolveAffiliateRate({
    ...base,
    platformCommissionRate: 30,
    affiliateEnabled: true,
    affiliateEnrolledBy: "seller",
    affiliateCommissionRate: 95,
  });
  assert.equal(result.rate, 70); // 100% − the 30% platform commission
  assert.equal(maxSellerFundedRate(30), 70);
});

test("line commission rounds to whole pesewas", () => {
  assert.equal(affiliateLineCommission(49.99, 3, 7.5), 11.25);
  assert.equal(affiliateLineCommission(100, 2, 0), 0);
  assert.equal(affiliateLineCommission(19.99, 1, 5), 1);
});
