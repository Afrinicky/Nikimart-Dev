import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assistName,
  deriveFollowUps,
  FOLLOW_UP_HOURS,
  hasUnread,
  isWaitingOn,
  leaksWithheldField,
  stageSummary,
  statusAfterMessage,
  type FollowUpOrder,
  type FollowUpThread,
} from "./affiliate-assist-rules.ts";

const NOW = new Date("2026-06-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function order(over: Partial<FollowUpOrder> = {}): FollowUpOrder {
  return {
    id: "o1",
    orderNumber: "NM-1001",
    status: "paid",
    createdAt: hoursAgo(2),
    stage: "created",
    stageAt: null,
    buyer: "Ama K.",
    contacted: true,
    lastContactAt: hoursAgo(1),
    ...over,
  };
}

function thread(over: Partial<FollowUpThread> = {}): FollowUpThread {
  return {
    id: "t1",
    kind: "customer",
    status: "waiting_affiliate",
    topic: "delivery",
    subject: "Where is my parcel?",
    who: "Ama K.",
    orderNumber: "NM-1001",
    lastMessageAt: hoursAgo(1),
    lastMessageRole: "customer",
    relayedAt: null,
    ...over,
  };
}

function derive(over: {
  orders?: FollowUpOrder[];
  threads?: FollowUpThread[];
  handledKeys?: string[];
}) {
  return deriveFollowUps({
    orders: over.orders ?? [],
    threads: over.threads ?? [],
    handledKeys: over.handledKeys ?? [],
    now: NOW,
  });
}

// --- thread status ---------------------------------------------------------

test("a message hands the thread to the other side", () => {
  assert.equal(statusAfterMessage("customer", "affiliate"), "waiting_customer");
  assert.equal(statusAfterMessage("customer", "customer"), "waiting_affiliate");
  assert.equal(statusAfterMessage("support", "affiliate"), "waiting_support");
  assert.equal(statusAfterMessage("support", "support"), "waiting_affiliate");
});

test("unread is the other side's message against my own read mark", () => {
  const base = {
    lastMessageAt: hoursAgo(1),
    lastMessageRole: "customer",
    affiliateReadAt: null,
    customerReadAt: hoursAgo(1),
    supportReadAt: null,
  };
  assert.ok(hasUnread(base, "affiliate"));
  // My own message is never unread to me.
  assert.ok(!hasUnread(base, "customer"));
  // Read after it arrived.
  assert.ok(!hasUnread({ ...base, affiliateReadAt: NOW }, "affiliate"));
  // Read before it arrived.
  assert.ok(hasUnread({ ...base, affiliateReadAt: hoursAgo(5) }, "affiliate"));
  // An empty thread has nothing unread for anybody.
  assert.ok(!hasUnread({ ...base, lastMessageAt: null }, "affiliate"));
});

test("whose move it is", () => {
  assert.ok(isWaitingOn("waiting_affiliate", "affiliate"));
  assert.ok(isWaitingOn("open", "affiliate"));
  assert.ok(isWaitingOn("waiting_support", "support"));
  assert.ok(isWaitingOn("waiting_customer", "customer"));
  for (const role of ["affiliate", "customer", "support"] as const) {
    assert.ok(!isWaitingOn("resolved", role));
  }
});

// --- follow-ups from threads ----------------------------------------------

test("an unanswered customer raises a reply item", () => {
  const [item, ...rest] = derive({ threads: [thread()] });
  assert.equal(rest.length, 0);
  assert.equal(item.kind, "reply");
  assert.equal(item.urgency, "due");
  assert.equal(item.href, "/affiliate/messages/t1");
  assert.match(item.key, /^reply:t1:\d+$/);
});

test("an unanswered customer goes overdue at twice the threshold", () => {
  const old = thread({ lastMessageAt: hoursAgo(FOLLOW_UP_HOURS.reply * 2) });
  assert.equal(derive({ threads: [old] })[0].urgency, "overdue");
});

test("the affiliate's own last word raises nothing", () => {
  assert.equal(derive({ threads: [thread({ lastMessageRole: "affiliate" })] }).length, 0);
});

test("a resolved or empty thread raises nothing", () => {
  assert.equal(derive({ threads: [thread({ status: "resolved" })] }).length, 0);
  assert.equal(derive({ threads: [thread({ lastMessageAt: null })] }).length, 0);
});

test("support's answer asks to be relayed, once", () => {
  const t = thread({ kind: "support", lastMessageRole: "support", status: "waiting_affiliate" });
  const [item] = derive({ threads: [t] });
  assert.equal(item.kind, "relay");
  // Already passed on → nothing outstanding.
  assert.equal(derive({ threads: [{ ...t, relayedAt: NOW }] }).length, 0);
});

// --- follow-ups from orders ----------------------------------------------

test("a paid order nobody greeted asks for an introduction", () => {
  const o = order({ contacted: false, lastContactAt: null, createdAt: hoursAgo(30) });
  const [item] = derive({ orders: [o] });
  assert.equal(item.kind, "welcome");
  assert.equal(item.key, "welcome:o1");
  assert.equal(item.orderNumber, "NM-1001");
});

test("a fresh order is not yet a task", () => {
  const o = order({ contacted: false, lastContactAt: null, createdAt: hoursAgo(2) });
  assert.equal(derive({ orders: [o] }).length, 0);
});

test("an unpaid order is nobody's follow-up", () => {
  const o = order({ status: "pending", contacted: false, lastContactAt: null, createdAt: hoursAgo(300) });
  assert.equal(derive({ orders: [o] }).length, 0);
});

test("a paid order that is not prepared asks to be chased", () => {
  const o = order({ createdAt: hoursAgo(FOLLOW_UP_HOURS.preparing + 5), stageAt: null });
  const [item] = derive({ orders: [o] });
  assert.equal(item.kind, "delay");
  assert.match(item.detail, /not yet prepared/);
});

test("a chased order asks again the next week", () => {
  const stageAt = hoursAgo(FOLLOW_UP_HOURS.transit + 2);
  const o = order({ status: "shipped", stage: "in_transit", stageAt });
  const first = derive({ orders: [o] })[0];
  // Handling it settles it now...
  assert.equal(derive({ orders: [o], handledKeys: [first.key] }).length, 0);
  // ...and a week later the key has moved on, so it is outstanding again.
  const later = deriveFollowUps({
    orders: [o],
    threads: [],
    handledKeys: [first.key],
    now: new Date(NOW.getTime() + 8 * 86_400_000),
  });
  assert.equal(later.length, 1);
  assert.notEqual(later[0].key, first.key);
});

test("a delivered order asks for a check-in, inside a fortnight", () => {
  const o = order({
    status: "delivered",
    stage: "delivered",
    stageAt: hoursAgo(FOLLOW_UP_HOURS.delivered + 1),
    lastContactAt: hoursAgo(400),
  });
  assert.equal(derive({ orders: [o] })[0].kind, "delivered");
  // A word since delivery settles it.
  assert.equal(derive({ orders: [{ ...o, lastContactAt: hoursAgo(1) }] }).length, 0);
  // And a month on, it is not a follow-up any more.
  assert.equal(derive({ orders: [{ ...o, stageAt: hoursAgo(24 * 30) }] }).length, 0);
});

test("a cancelled order offers a hand", () => {
  const o = order({
    status: "cancelled",
    stageAt: hoursAgo(FOLLOW_UP_HOURS.cancelled + 1),
    lastContactAt: hoursAgo(200),
  });
  assert.equal(derive({ orders: [o] })[0].kind, "cancelled");
});

test("one order raises one item at most", () => {
  const o = order({
    contacted: false,
    lastContactAt: null,
    createdAt: hoursAgo(FOLLOW_UP_HOURS.preparing + 100),
  });
  assert.equal(derive({ orders: [o] }).length, 1);
});

// --- ordering and handling ------------------------------------------------

test("overdue comes first, then the oldest", () => {
  const items = derive({
    orders: [
      order({ id: "o2", orderNumber: "NM-2", status: "delivered", stage: "delivered", stageAt: hoursAgo(80), lastContactAt: hoursAgo(500) }),
      order({ id: "o3", orderNumber: "NM-3", status: "delivered", stage: "delivered", stageAt: hoursAgo(200), lastContactAt: hoursAgo(500) }),
    ],
    threads: [thread()],
  });
  assert.equal(items[0].urgency, "overdue");
  assert.equal(items[0].orderNumber, "NM-3");
  assert.equal(items.at(-1)?.kind, "reply");
});

test("handled keys drop out", () => {
  const t = thread();
  const [item] = derive({ threads: [t] });
  assert.equal(derive({ threads: [t], handledKeys: [item.key] }).length, 0);
});

// --- what an affiliate sees ----------------------------------------------

test("a customer is a first name and an initial", () => {
  assert.equal(assistName("Ama Kwarteng"), "Ama K.");
  assert.equal(assistName("Ama Serwaa Kwarteng"), "Ama K.");
  assert.equal(assistName("Ama"), "Ama");
  assert.equal(assistName("  "), "Customer");
  assert.equal(assistName(null), "Customer");
});

test("the withheld fields are named, and a leak is detectable", () => {
  assert.ok(leaksWithheldField(["orderNumber", "amountPaid"]));
  assert.ok(leaksWithheldField(["address"]));
  assert.ok(!leaksWithheldField(["orderNumber", "status", "subtotal", "createdAt"]));
});

test("a parcel's position reads in one line", () => {
  assert.equal(stageSummary("cancelled", "in_transit"), "Cancelled");
  assert.equal(stageSummary("pending", "created"), "Awaiting payment");
  assert.equal(stageSummary("paid", "created"), "Paid — with the shop");
  assert.equal(stageSummary("paid", "processing"), "Prepared by the shop");
  assert.equal(stageSummary("shipped", "in_transit"), "In transit");
  assert.equal(stageSummary("delivered", "delivered"), "Delivered");
});
