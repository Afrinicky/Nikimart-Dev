import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyToRegistration,
  commissionQualifies,
  registrationOutstanding,
  registrationQuote,
  rewardForLevel,
  teamCommissionOn,
  teamPercentForLevel,
  teamRewardsLine,
  type AffiliateTeamRules,
} from "./affiliate-team-rules.ts";

/**
 * The affiliate referral programme's arithmetic, pinned down.
 *
 * Every case here is a way of paying the wrong person the wrong amount: an
 * upline earning more than the affiliate who made the sale, a level-2 tier
 * paying while it is switched off, a registration fee that is quoted one way
 * and charged another, or a cleared commission that pays the affiliate before
 * the fee it was promised to.
 *
 * Run with: npm test
 */

const RULES: AffiliateTeamRules = {
  enabled: true,
  level1Reward: 10,
  level2Reward: 4,
  level2Enabled: true,
  teamPercentLevel1: 10,
  teamPercentLevel2: 5,
  minCommission: 0,
};

test("the team cut is a percentage of the recruit's own commission", () => {
  assert.equal(teamCommissionOn(20, 10), 2);
  assert.equal(teamCommissionOn(7.77, 10), 0.78);
});

test("a team cut can never exceed the commission it is a share of", () => {
  assert.equal(teamCommissionOn(20, 400), 20);
  assert.equal(teamCommissionOn(20, -5), 0);
  assert.equal(teamCommissionOn(0, 10), 0);
});

test("the second tier pays nothing while it is switched off", () => {
  const off = { ...RULES, level2Enabled: false };
  assert.equal(teamPercentForLevel(off, 2), 0);
  assert.equal(rewardForLevel(off, 2), 0);
  // The first tier is untouched by the switch.
  assert.equal(teamPercentForLevel(off, 1), 10);
  assert.equal(rewardForLevel(off, 1), 10);
});

test("a commission under the minimum pays the upline nothing", () => {
  assert.equal(commissionQualifies(0.4, 1), false);
  assert.equal(commissionQualifies(1, 1), true);
  // Zero is the default and switches the check off — but nothing earned is
  // still nothing to share.
  assert.equal(commissionQualifies(0.01, 0), true);
  assert.equal(commissionQualifies(0, 0), false);
});

test("the rewards line says both halves, because they are paid at different moments", () => {
  const line = teamRewardsLine(RULES);
  assert.match(line, /when someone you recruit joins/);
  assert.match(line, /10% of what your recruits earn/);
  assert.match(
    teamRewardsLine({ ...RULES, level1Reward: 0, level2Reward: 0 }),
    /of what your recruits earn/,
  );
  assert.equal(
    teamRewardsLine({ ...RULES, enabled: false }),
    "The referral programme is paused at the moment.",
  );
  assert.match(
    teamRewardsLine({
      enabled: true,
      level1Reward: 0,
      level2Reward: 0,
      level2Enabled: false,
      teamPercentLevel1: 0,
      teamPercentLevel2: 0,
      minCommission: 0,
    }),
    /doesn't pay anything extra/,
  );
});

test("a registration fee's parts always add up to the gross", () => {
  const quote = registrationQuote({
    fee: 50,
    waiverPercent: 40,
    referrerSharePercent: 50,
    hasReferrer: true,
  });
  assert.equal(quote.gross, 50);
  assert.equal(quote.waived, 20);
  assert.equal(quote.payable, 30);
  assert.equal(quote.referrerShare, 15);
  assert.equal(quote.nickimartKeeps, 15);
  assert.equal(quote.waived + quote.payable, quote.gross);
});

test("nobody is owed a share when nobody recruited them", () => {
  const quote = registrationQuote({
    fee: 50,
    waiverPercent: 40,
    referrerSharePercent: 50,
    hasReferrer: false,
  });
  assert.equal(quote.payable, 50);
  assert.equal(quote.referrerShare, 0);
});

test("a cleared commission pays the registration fee before the affiliate", () => {
  assert.deepEqual(applyToRegistration(12, 20), {
    toFee: 12,
    toAffiliate: 0,
    owedAfter: 8,
  });
  assert.deepEqual(applyToRegistration(30, 20), {
    toFee: 20,
    toAffiliate: 10,
    owedAfter: 0,
  });
  assert.deepEqual(applyToRegistration(30, 0), {
    toFee: 0,
    toAffiliate: 30,
    owedAfter: 0,
  });
});

test("a settled fee owes nothing, whatever the column says", () => {
  assert.equal(registrationOutstanding(20, new Date()), 0);
  assert.equal(registrationOutstanding(20, null), 20);
  assert.equal(registrationOutstanding(-5, null), 0);
});
