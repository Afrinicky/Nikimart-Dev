import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feeCanReward,
  referralLink,
  referralRewardsLine,
  registrationOutstanding,
  rewardForLevel,
  saleQualifies,
  teamCommissionAmount,
} from "./referral-rules.ts";

/**
 * The referral programme's rules.
 *
 * Each of these is a place where being wrong pays somebody money they did not
 * earn, or withholds money somebody was promised. The two that matter most are
 * at the bottom: a waived registration fee must never mint a reward, and the
 * second level must stop at the second level.
 *
 * Run with: npm test
 */

const RULES = {
  level1Reward: 10,
  level2Reward: 4,
  level2Enabled: true,
  teamCommissionDefault: 0.5,
  minSaleAmount: 0,
  minSaleCommission: 0,
};

// --- Qualifying sales -------------------------------------------------------

test("with no conditions set, every sale qualifies", () => {
  assert.equal(saleQualifies(1, 0, { minSaleAmount: 0, minSaleCommission: 0 }), true);
});

test("a sale under the minimum amount does not qualify", () => {
  const rules = { minSaleAmount: 5, minSaleCommission: 0 };
  assert.equal(saleQualifies(4.99, 2, rules), false);
  assert.equal(saleQualifies(5, 2, rules), true);
});

test("a sale the agent made no margin on does not qualify", () => {
  const rules = { minSaleAmount: 0, minSaleCommission: 0.5 };
  // Priced at cost — almost always a mistake, and never worth paying a team
  // commission out of a margin that isn't there.
  assert.equal(saleQualifies(20, 0, rules), false);
  assert.equal(saleQualifies(20, 0.5, rules), true);
});

// --- Team commission --------------------------------------------------------

test("a bundle's own amount wins over the programme default", () => {
  assert.equal(teamCommissionAmount(1.25, 0.5), 1.25);
});

test("a bundle with no amount of its own falls back to the default", () => {
  assert.equal(teamCommissionAmount(0, 0.5), 0.5);
});

test("zero on both pays nothing, and nothing is ever negative", () => {
  assert.equal(teamCommissionAmount(0, 0), 0);
  assert.equal(teamCommissionAmount(-5, -2), 0);
});

// --- Reward levels ----------------------------------------------------------

test("both levels pay when both are configured", () => {
  assert.equal(rewardForLevel(RULES, 1), 10);
  assert.equal(rewardForLevel(RULES, 2), 4);
});

test("turning off the second level stops it paying, and leaves the first alone", () => {
  const rules = { ...RULES, level2Enabled: false };
  assert.equal(rewardForLevel(rules, 1), 10);
  assert.equal(rewardForLevel(rules, 2), 0);
});

test("a negative reward pays nothing rather than debiting the recruiter", () => {
  assert.equal(rewardForLevel({ ...RULES, level1Reward: -10 }, 1), 0);
});

// --- The registration fee ---------------------------------------------------

test("a waived registration fee never pays a referral reward", () => {
  assert.equal(feeCanReward("WAIVED", 30), false);
});

test("a fee of zero pays nothing however it became zero", () => {
  assert.equal(feeCanReward("BALANCE", 0), false);
  assert.equal(feeCanReward("UPFRONT", 0), false);
});

test("a real fee, settled either way, can pay a reward", () => {
  assert.equal(feeCanReward("BALANCE", 30), true);
  assert.equal(feeCanReward("UPFRONT", 30), true);
});

test("what is outstanding is how far below zero the balance still is", () => {
  assert.equal(registrationOutstanding(-30, 30, null), 30);
  assert.equal(registrationOutstanding(-12.5, 30, null), 12.5);
  assert.equal(registrationOutstanding(0, 30, null), 0);
  assert.equal(registrationOutstanding(4, 30, null), 0);
});

test("an admin adjustment pushing the balance further negative is not registration fee", () => {
  assert.equal(registrationOutstanding(-100, 30, null), 30);
});

test("a fee already settled is never outstanding, whatever the balance says", () => {
  assert.equal(registrationOutstanding(-30, 30, new Date()), 0);
});

// --- What the agent sees ----------------------------------------------------

test("the referral link carries the agent's own code", () => {
  assert.equal(
    referralLink("https://nickimart.gh", "NKM4821"),
    "https://nickimart.gh/become-an-agent?ref=NKM4821",
  );
});

test("a trailing slash on the origin doesn't double up in the link", () => {
  assert.equal(
    referralLink("https://nickimart.gh/", "NKM4821"),
    "https://nickimart.gh/become-an-agent?ref=NKM4821",
  );
});

test("the rewards line names both levels when both pay", () => {
  const line = referralRewardsLine(RULES);
  assert.match(line, /10\.00 when someone you recruit registers/);
  assert.match(line, /4\.00 when they recruit someone/);
});

test("the rewards line drops the second level when it is off", () => {
  const line = referralRewardsLine({ ...RULES, level2Enabled: false });
  assert.match(line, /when someone you recruit registers/);
  assert.doesNotMatch(line, /when they recruit someone/);
});

test("a paused programme says so rather than quoting rewards nobody will get", () => {
  assert.match(referralRewardsLine({ ...RULES, enabled: false }), /paused/);
});

test("with no joining rewards at all, the line still points at team sales", () => {
  const line = referralRewardsLine({ ...RULES, level1Reward: 0, level2Reward: 0 });
  assert.match(line, /what your team sells/);
});
