import { test } from "node:test";
import assert from "node:assert/strict";
import { describeEmailSender, htmlToText, isSandboxDomain, senderDomain } from "./email-sender.ts";

/**
 * Whether email actually reaches a customer.
 *
 * The failure this guards against is a quiet one: with Resend's shared sandbox
 * sender the API accepts the account owner's own address and refuses everyone
 * else, so the person switching email on receives their test, sees it work, and
 * ships a store whose buyers never get a receipt or a reset code. "Key is set"
 * cannot distinguish that from a working configuration, so `deliverable` is
 * kept separate from `configured` and pinned here.
 */

const KEY = "re_test_key";

test("a sender address is read in both of its forms", () => {
  assert.equal(senderDomain("orders@shop.example"), "shop.example");
  assert.equal(senderDomain("Nickimart <orders@shop.example>"), "shop.example");
  // Case and padding are noise; a display name containing an @ is not the domain.
  assert.equal(senderDomain("  Orders <ORDERS@Shop.Example>  "), "shop.example");
  assert.equal(senderDomain("a@b.test <orders@shop.example>"), "shop.example");
});

test("an unreadable sender is reported as unreadable, never guessed", () => {
  for (const bad of ["", "   ", "not-an-address", "@shop.example", "orders@", "orders@localhost", "orders@sh op.example"]) {
    assert.equal(senderDomain(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("the sandbox domain is recognised, including subdomains", () => {
  assert.ok(isSandboxDomain("resend.dev"));
  assert.ok(isSandboxDomain("mail.resend.dev"));
  assert.ok(!isSandboxDomain("resend.dev.shop.example")); // lookalike, not the sandbox
  assert.ok(!isSandboxDomain("myresend.dev"));
  assert.ok(!isSandboxDomain(null));
});

test("no key means email is off, not broken", () => {
  for (const key of [undefined, "", "   "]) {
    const s = describeEmailSender(key, "Nickimart <orders@shop.example>");
    assert.equal(s.readiness, "off");
    assert.equal(s.configured, false);
    assert.equal(s.deliverable, false);
    assert.match(s.detail, /RESEND_API_KEY/);
  }
});

test("the sandbox sender is configured but NOT deliverable", () => {
  // The whole point of this module. A key plus the default from-address looks
  // like a working setup and reaches no customer.
  const s = describeEmailSender(KEY, "Nickimart <onboarding@resend.dev>");
  assert.equal(s.readiness, "sandbox");
  assert.equal(s.configured, true);
  assert.equal(s.deliverable, false, "sandbox sender must never be reported as deliverable");
  assert.match(s.detail, /verify/i);
});

test("an unusable from-address is called out rather than passed through", () => {
  const s = describeEmailSender(KEY, "Nickimart");
  assert.equal(s.readiness, "invalid");
  assert.equal(s.configured, true);
  assert.equal(s.deliverable, false);
});

test("a verified custom domain is deliverable", () => {
  const s = describeEmailSender(KEY, "Nickimart <orders@shop.example>");
  assert.equal(s.readiness, "ready");
  assert.equal(s.configured, true);
  assert.equal(s.deliverable, true);
  assert.equal(s.domain, "shop.example");
});

test("only a real custom domain flips deliverable to true", () => {
  // Guards the classification as a whole: exactly one of these arrangements
  // may claim it can email a customer.
  const cases: [string | undefined, string][] = [
    [undefined, "Nickimart <orders@shop.example>"],
    [KEY, "Nickimart <onboarding@resend.dev>"],
    [KEY, "onboarding@resend.dev"],
    [KEY, "broken"],
    [KEY, ""],
  ];
  for (const [key, from] of cases) {
    assert.equal(
      describeEmailSender(key, from).deliverable,
      false,
      `${JSON.stringify({ key, from })} must not be deliverable`,
    );
  }
  assert.equal(describeEmailSender(KEY, "orders@shop.example").deliverable, true);
});

/**
 * The plain-text alternative. A reset code that renders only as HTML is a reset
 * code some people cannot read, so the text part has to carry the content.
 */

test("the text alternative keeps the words and drops the markup", () => {
  const html =
    '<div style="padding:24px"><div>Nick<span>imart</span></div>' +
    "<h1>Password reset code</h1><p>Use this code:<br/><br/>" +
    '<div style="font-size:28px">123456</div></p><hr /><p>Ignore if not you.</p></div>';
  const text = htmlToText(html);
  assert.match(text, /123456/, "the code must survive into the text part");
  assert.match(text, /Password reset code/);
  assert.ok(!text.includes("<"), `markup leaked: ${text}`);
  assert.ok(!text.includes("padding:24px"), "style attributes leaked into the text part");
});

test("the text alternative unescapes entities and keeps line structure", () => {
  assert.equal(htmlToText("<p>Terms &amp; conditions</p>"), "Terms & conditions");
  assert.equal(htmlToText("<p>one</p><p>two</p>"), "one\ntwo");
  assert.equal(htmlToText("a<br/>b"), "a\nb");
  // Runs of blank lines collapse rather than padding the message out.
  assert.equal(htmlToText("<p>a</p><br/><br/><br/><p>b</p>"), "a\n\nb");
  assert.equal(htmlToText("<style>p{color:red}</style><p>hi</p>"), "hi");
});
