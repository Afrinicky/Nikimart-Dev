import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
// Relative, with the extension: run through Node's type stripping, which
// resolves neither the "@/…" alias nor a missing extension.
import {
  kindsFor,
  signedAmount,
  TOPUP_KINDS,
  topupKindOptions,
  TRANSACTION_KINDS,
  transactionKind,
} from "./transaction-kinds.ts";

/**
 * The signing rule, which is the one thing on a ledger that must not be
 * guessed at. A debit shown as a credit is worse than no figure at all, and it
 * is exactly what an adjustment used to do: an admin taking GH₵500 off an
 * agent read as "+GH₵500.00".
 */
describe("signedAmount", () => {
  it("makes money out negative, however it arrives", () => {
    assert.equal(signedAmount("out", 60), -60);
    assert.equal(signedAmount("out", -60), -60);
  });

  it("leaves money in positive", () => {
    assert.equal(signedAmount("in", 30), 30);
  });

  it("keeps the sign on a movement inside the platform", () => {
    // A goodwill credit and a correction that takes money back off an agent
    // are both "internal", and they are not the same thing.
    assert.equal(signedAmount("internal", 25), 25);
    assert.equal(signedAmount("internal", -500), -500);
  });
});

describe("the vocabulary", () => {
  it("gives every kind exactly one direction", () => {
    for (const kind of TRANSACTION_KINDS) {
      assert.ok(["in", "out", "internal"].includes(kind.flow), `${kind.key} has no direction`);
    }
  });

  it("has no duplicate keys", () => {
    const keys = TRANSACTION_KINDS.map((k) => k.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("keeps the provider's own wallet off the bundle ledger", () => {
    // Those movements are not Nickimart's book — they belong to the top-ups
    // tab, and offering them in the ledger's filter would promise rows it
    // never shows.
    const dataKeys = kindsFor("data").map((k) => k.key);
    assert.ok(!dataKeys.includes("PROVIDER_FUNDING"));
    assert.ok(!dataKeys.includes("PROVIDER_DEBIT"));
  });

  it("counts a sale paid from an agent float as internal", () => {
    // The cash came in when the float was topped up. Banking it again on the
    // order would read a GH₵100 top-up spent on bundles as GH₵200 in.
    assert.equal(transactionKind("WALLET_ORDER")?.flow, "internal");
    assert.equal(transactionKind("WALLET_TOPUP")?.flow, "in");
  });

  it("treats funding the provider float as a transfer, not a cost", () => {
    // The cedis move from one Nickimart pocket to another: they become stock,
    // and they are expensed later as the cost price of the bundles they buy.
    // Calling it money out charged the same cedi twice — once on the top-ups
    // tab and again on every order it funded — and showed an afternoon's
    // funding as a GH₵300 loss.
    assert.equal(transactionKind("PROVIDER_FUNDING")?.flow, "internal");
    assert.equal(transactionKind("PROVIDER_DEBIT")?.flow, "internal");
  });

  it("signs a provider debit as a reduction without counting it out", () => {
    // The row arrives carrying a negative amount of its own, so it reads as a
    // minus on the tab while staying out of the money-out total.
    assert.equal(signedAmount("internal", -2.43), -2.43);
    assert.equal(signedAmount("internal", 300), 300);
  });

  it("separates a refund to a card from a refund to a float", () => {
    assert.equal(transactionKind("REFUND")?.flow, "out");
    assert.equal(transactionKind("WALLET_REFUND")?.flow, "internal");
  });

  it("offers every top-up kind, and only those", () => {
    const options = topupKindOptions();
    assert.equal(options[0].value, "all");
    assert.deepEqual(options.slice(1).map((o) => o.value), [...TOPUP_KINDS]);
    for (const option of options.slice(1)) {
      assert.ok(option.label.length > 0, `${option.value} has no label`);
    }
  });
});
