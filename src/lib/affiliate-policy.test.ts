import { test } from "node:test";
import assert from "node:assert/strict";
import {
  admissionRoute,
  assessReferral,
  attributionExpiry,
  commissionHoldUntil,
  commissionStatusFor,
  isPayable,
  pickAttribution,
  renderShareMessage,
  resolveAffiliatePolicy,
  resolveProductRate,
  reversalForRefund,
} from "./affiliate-policy.ts";

/**
 * The affiliate programme's rules, pinned down.
 *
 * Everything here decides whether somebody gets paid, so every one of these is
 * a case that was either wrong once or would be expensive to get wrong: a
 * window that expires in the past, a self-referral that earns, a partial
 * refund that voids a whole commission, a commission that clears while the
 * buyer can still send the goods back.
 *
 * Run with: npm test
 */

const DAY = 86_400_000;
const now = new Date("2026-03-15T12:00:00Z");

// ---------------------------------------------------------------------------
// Policy resolution
// ---------------------------------------------------------------------------

test("an empty settings table resolves to the documented defaults", () => {
  const p = resolveAffiliatePolicy({});
  assert.equal(p.enabled, true);
  assert.equal(p.attributionWindowDays, 30);
  assert.equal(p.attributionModel, "last");
  assert.equal(p.returnWindowDays, 7);
  assert.equal(p.blockSelfReferral, true);
});

test("a mistyped window falls back rather than expiring everything at once", () => {
  assert.equal(resolveAffiliatePolicy({ affiliateAttributionWindowDays: "" }).attributionWindowDays, 30);
  assert.equal(resolveAffiliatePolicy({ affiliateAttributionWindowDays: "soon" }).attributionWindowDays, 30);
  // Zero days would attribute nothing at all, which nobody means to configure.
  assert.equal(resolveAffiliatePolicy({ affiliateAttributionWindowDays: "0" }).attributionWindowDays, 1);
  assert.equal(resolveAffiliatePolicy({ affiliateAttributionWindowDays: "90" }).attributionWindowDays, 90);
});

test("a return window of zero is a real choice and is kept", () => {
  assert.equal(resolveAffiliatePolicy({ affiliateReturnWindowDays: "0" }).returnWindowDays, 0);
});

test("switches read the values an admin form actually submits", () => {
  assert.equal(resolveAffiliatePolicy({ affiliateProgramEnabled: "0" }).enabled, false);
  assert.equal(resolveAffiliatePolicy({ affiliateProgramEnabled: "off" }).enabled, false);
  assert.equal(resolveAffiliatePolicy({ affiliateProgramEnabled: "1" }).enabled, true);
});

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

test("an attribution expires the configured number of days out", () => {
  const expiry = attributionExpiry(now, 30);
  assert.equal(expiry.getTime() - now.getTime(), 30 * DAY);
});

test("last-click attribution picks the most recent live referral", () => {
  const candidates = [
    { affiliateId: "a", firstSeenAt: new Date(now.getTime() - 20 * DAY), lastSeenAt: new Date(now.getTime() - 20 * DAY), expiresAt: new Date(now.getTime() + 10 * DAY) },
    { affiliateId: "b", firstSeenAt: new Date(now.getTime() - 2 * DAY), lastSeenAt: new Date(now.getTime() - 2 * DAY), expiresAt: new Date(now.getTime() + 28 * DAY) },
  ];
  assert.equal(pickAttribution(candidates, "last", now)?.affiliateId, "b");
  assert.equal(pickAttribution(candidates, "first", now)?.affiliateId, "a");
});

test("an expired attribution is no claim at all, not a weaker one", () => {
  const candidates = [
    { affiliateId: "stale", firstSeenAt: new Date(now.getTime() - 40 * DAY), lastSeenAt: new Date(now.getTime() - 40 * DAY), expiresAt: new Date(now.getTime() - DAY) },
  ];
  assert.equal(pickAttribution(candidates, "last", now), null);
});

// ---------------------------------------------------------------------------
// Abuse
// ---------------------------------------------------------------------------

const policy = { enabled: true, blockSelfReferral: true, maxOrdersPerVisitorPerDay: 3 };

test("an affiliate buying through their own link earns nothing", () => {
  const verdict = assessReferral({
    affiliateUserId: "u1",
    affiliateStatus: "active",
    buyerUserId: "u1",
    expiresAt: new Date(now.getTime() + DAY),
    policy,
    now,
  });
  assert.equal(verdict.attributed, false);
  assert.equal(verdict.signals[0].kind, "self_referral");
  assert.equal(verdict.signals[0].severity, "block");
});

test("a suspended affiliate does not earn on new orders", () => {
  const verdict = assessReferral({
    affiliateUserId: "u1",
    affiliateStatus: "suspended",
    buyerUserId: "u2",
    expiresAt: new Date(now.getTime() + DAY),
    policy,
    now,
  });
  assert.equal(verdict.attributed, false);
  assert.ok(verdict.signals.some((s) => s.kind === "suspended"));
});

test("a referral whose window has closed does not earn", () => {
  const verdict = assessReferral({
    affiliateUserId: "u1",
    affiliateStatus: "active",
    buyerUserId: "u2",
    expiresAt: new Date(now.getTime() - DAY),
    policy,
    now,
  });
  assert.equal(verdict.attributed, false);
  assert.ok(verdict.signals.some((s) => s.kind === "expired_window"));
});

test("matching contact details are flagged for review but still earn", () => {
  const verdict = assessReferral({
    affiliateUserId: "u1",
    affiliateStatus: "active",
    buyerUserId: "u2",
    contactMatch: true,
    expiresAt: new Date(now.getTime() + DAY),
    policy,
    now,
  });
  assert.equal(verdict.attributed, true);
  assert.equal(verdict.signals[0].kind, "same_account");
  assert.equal(verdict.signals[0].severity, "warn");
});

test("a device over the daily cap is flagged but not refused", () => {
  const verdict = assessReferral({
    affiliateUserId: "u1",
    affiliateStatus: "active",
    buyerUserId: "u2",
    visitorOrdersToday: 4,
    expiresAt: new Date(now.getTime() + DAY),
    policy,
    now,
  });
  assert.equal(verdict.attributed, true);
  assert.ok(verdict.signals.some((s) => s.kind === "velocity"));
});

test("a clean referral earns and raises nothing", () => {
  const verdict = assessReferral({
    affiliateUserId: "u1",
    affiliateStatus: "active",
    buyerUserId: "u2",
    expiresAt: new Date(now.getTime() + 10 * DAY),
    policy,
    now,
  });
  assert.equal(verdict.attributed, true);
  assert.deepEqual(verdict.signals, []);
});

test("nothing attributes while the programme is switched off", () => {
  const verdict = assessReferral({
    affiliateUserId: "u1",
    affiliateStatus: "active",
    buyerUserId: "u2",
    expiresAt: new Date(now.getTime() + DAY),
    policy: { ...policy, enabled: false },
    now,
  });
  assert.equal(verdict.attributed, false);
});

// ---------------------------------------------------------------------------
// The commission lifecycle
// ---------------------------------------------------------------------------

const live = { returnWindowDays: 7, paid: false, reversed: false, now };

test("commission on a paid but undelivered order is pending", () => {
  assert.equal(
    commissionStatusFor({ ...live, orderStatus: "paid", deliveredAt: null }),
    "pending",
  );
});

test("commission on a delivered order sits in the return window before it clears", () => {
  assert.equal(
    commissionStatusFor({ ...live, orderStatus: "delivered", deliveredAt: new Date(now.getTime() - 2 * DAY) }),
    "clearing",
  );
  assert.equal(
    commissionStatusFor({ ...live, orderStatus: "delivered", deliveredAt: new Date(now.getTime() - 8 * DAY) }),
    "cleared",
  );
});

test("a zero-day return window clears on delivery", () => {
  assert.equal(
    commissionStatusFor({ ...live, returnWindowDays: 0, orderStatus: "delivered", deliveredAt: now }),
    "cleared",
  );
});

test("a cancelled order reverses its commission whatever else is true", () => {
  assert.equal(
    commissionStatusFor({ ...live, orderStatus: "cancelled", deliveredAt: new Date(now.getTime() - 30 * DAY) }),
    "reversed",
  );
});

test("a paid commission stays paid when the order moves on", () => {
  assert.equal(
    commissionStatusFor({ ...live, paid: true, orderStatus: "delivered", deliveredAt: now }),
    "paid",
  );
});

test("a reversal outranks a payout — a clawback must not read as paid", () => {
  assert.equal(
    commissionStatusFor({ ...live, paid: true, reversed: true, orderStatus: "delivered", deliveredAt: now }),
    "reversed",
  );
});

test("only cleared commission is payable", () => {
  assert.equal(isPayable("cleared"), true);
  for (const s of ["pending", "clearing", "paid", "reversed"] as const) {
    assert.equal(isPayable(s), false, `${s} must not be payable`);
  }
});

test("the hold runs from delivery, not from the order date", () => {
  const delivered = new Date("2026-03-10T09:00:00Z");
  assert.equal(
    commissionHoldUntil(delivered, 7).toISOString(),
    new Date(delivered.getTime() + 7 * DAY).toISOString(),
  );
});

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

test("a full refund takes back the whole commission", () => {
  assert.equal(reversalForRefund(10, 200, 200), 10);
  assert.equal(reversalForRefund(10, 200, 500), 10);
});

test("a partial refund takes back its share and no more", () => {
  assert.equal(reversalForRefund(10, 200, 100), 5);
  assert.equal(reversalForRefund(9, 300, 100), 3);
});

test("a refund of nothing takes back nothing", () => {
  assert.equal(reversalForRefund(10, 200, 0), 0);
  assert.equal(reversalForRefund(0, 200, 200), 0);
});

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

const open = {
  enabled: true,
  applicationsOpen: true,
  autoApproveSellers: true,
  autoApproveAgents: true,
};

test("a seller and an agent walk straight in", () => {
  assert.equal(admissionRoute({ isSeller: true, isAgent: false, isAdmin: false }, open), "auto");
  assert.equal(admissionRoute({ isSeller: false, isAgent: true, isAdmin: false }, open), "auto");
});

test("everybody else applies", () => {
  assert.equal(admissionRoute({ isSeller: false, isAgent: false, isAdmin: false }, open), "apply");
});

test("auto-approval off sends a seller through the queue like anybody else", () => {
  assert.equal(
    admissionRoute({ isSeller: true, isAgent: false, isAdmin: false }, { ...open, autoApproveSellers: false }),
    "apply",
  );
});

test("closed applications say so rather than taking a form nobody reads", () => {
  assert.equal(
    admissionRoute({ isSeller: false, isAgent: false, isAdmin: false }, { ...open, applicationsOpen: false }),
    "closed",
  );
  assert.equal(
    admissionRoute({ isSeller: true, isAgent: true, isAdmin: true }, { ...open, enabled: false }),
    "closed",
  );
});

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

const product = {
  affiliateEnabled: true,
  affiliateEnrolledBy: "seller",
  affiliateCommissionRate: null,
  categoryAffiliateRate: null,
  defaultAffiliateRate: 5,
  platformCommissionRate: 10,
};

test("the rate's source is recorded so the console can explain it", () => {
  assert.equal(resolveProductRate(product).source, "default");
  assert.equal(resolveProductRate({ ...product, categoryAffiliateRate: 8 }).source, "category");
  assert.equal(resolveProductRate({ ...product, affiliateCommissionRate: 12 }).source, "product");
  assert.equal(resolveProductRate({ ...product, affiliateOverride: 9 }).source, "affiliate");
});

test("an affiliate's negotiated rate stands in for the programme default", () => {
  assert.equal(resolveProductRate({ ...product, affiliateOverride: 9 }).rate, 9);
  // …but a rate the product names itself still wins.
  assert.equal(
    resolveProductRate({ ...product, affiliateOverride: 9, affiliateCommissionRate: 12 }).rate,
    12,
  );
});

test("a product that isn't enrolled earns nothing, override or not", () => {
  const r = resolveProductRate({ ...product, affiliateEnabled: false, affiliateOverride: 20 });
  assert.equal(r.rate, 0);
  assert.equal(r.fundedBy, "");
});

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

test("a caption fills in the product, the price and the link", () => {
  const out = renderShareMessage("{product} is {price} — grab it: {link}", {
    product: "Kente throw",
    price: "GH₵240",
    link: "https://nickimart.com/r/ABC",
  });
  assert.equal(out, "Kente throw is GH₵240 — grab it: https://nickimart.com/r/ABC");
});

test("a caption that forgets the link gets it appended rather than going out broken", () => {
  const out = renderShareMessage("Lovely thing, DM me", {
    product: "Kente throw",
    price: "GH₵240",
    link: "https://nickimart.com/r/ABC",
  });
  assert.ok(out.includes("https://nickimart.com/r/ABC"));
  assert.ok(out.startsWith("Lovely thing, DM me"));
});

test("braces that aren't placeholders are left alone", () => {
  const out = renderShareMessage("50% {off} today {link}", {
    product: "x",
    price: "y",
    link: "L",
  });
  assert.equal(out, "50% {off} today L");
});
