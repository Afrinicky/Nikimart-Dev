/**
 * The rules behind an affiliate's follow-up work.
 *
 * An affiliate who referred a sale is the person that buyer asks where their
 * parcel is. Doing that job well is mostly a matter of knowing what is
 * outstanding, and "outstanding" is not a flag somebody sets — it is a shape
 * the orders and the conversations are already in: a buyer who wrote and has
 * had no answer, an order that has not moved in a week, a delivery nobody
 * checked on, an enquiry Nickimart has answered and the customer has not been
 * told about.
 *
 * So the list is derived, here, from state. Nothing writes a task. What is
 * written down is which item was *handled*, keyed on the state it was handled
 * in — so when a delayed order slips another week, or the buyer writes again,
 * the key changes and the item comes back. A follow-up list that can be
 * silenced for good stops being worth opening, and one that is kept in a table
 * drifts from the orders it describes.
 *
 * Pure, so the thresholds can be argued with in a test rather than in
 * production.
 */

// ---------------------------------------------------------------------------
// Who is who
// ---------------------------------------------------------------------------

export const ASSIST_ROLES = ["affiliate", "customer", "support"] as const;
export type AssistRole = (typeof ASSIST_ROLES)[number];

export function isAssistRole(value: string): value is AssistRole {
  return (ASSIST_ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<AssistRole, string> = {
  affiliate: "You",
  customer: "Customer",
  support: "Nickimart support",
};

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export const THREAD_KINDS = ["customer", "support"] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

/** What a conversation is about. Chosen by whoever starts it. */
export const THREAD_TOPICS = [
  { value: "general", label: "General question" },
  { value: "availability", label: "Product availability" },
  { value: "comparison", label: "Which one to buy" },
  { value: "delivery", label: "Delivery follow-up" },
  { value: "complaint", label: "Complaint" },
  { value: "return", label: "Return or refund" },
  { value: "repeat", label: "Repeat purchase" },
] as const;

export const TOPIC_LABELS: Record<string, string> = Object.fromEntries(
  THREAD_TOPICS.map((t) => [t.value, t.label]),
);

export function isTopic(value: string): boolean {
  return THREAD_TOPICS.some((t) => t.value === value);
}

export const THREAD_STATUSES = [
  "open",
  "waiting_customer",
  "waiting_affiliate",
  "waiting_support",
  "resolved",
] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const THREAD_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  waiting_customer: "Waiting on customer",
  waiting_affiliate: "Needs your reply",
  waiting_support: "With Nickimart",
  resolved: "Resolved",
};

/**
 * Where a thread stands once somebody has written in it.
 *
 * The status is never set by hand, because a status somebody has to remember
 * to change is a status that is wrong. Writing a message hands the thread to
 * the other side, and that is the whole rule — including on a thread that had
 * been resolved, which a new message reopens.
 */
export function statusAfterMessage(kind: string, author: AssistRole): ThreadStatus {
  if (kind === "support") {
    // An affiliate's enquiry sits with Nickimart; Nickimart's answer sits with
    // the affiliate, who has somebody waiting to be told.
    return author === "support" ? "waiting_affiliate" : "waiting_support";
  }
  return author === "customer" ? "waiting_affiliate" : "waiting_customer";
}

export interface ReadState {
  lastMessageAt: Date | null;
  lastMessageRole: string;
  affiliateReadAt: Date | null;
  customerReadAt: Date | null;
  supportReadAt: Date | null;
}

function readAtFor(thread: ReadState, role: AssistRole): Date | null {
  if (role === "affiliate") return thread.affiliateReadAt;
  if (role === "customer") return thread.customerReadAt;
  return thread.supportReadAt;
}

/**
 * Is there something in here this person has not seen?
 *
 * Derived from two timestamps rather than counted into a column: an unread
 * count has to be incremented by every writer and decremented by every reader,
 * and the first one that is missed is wrong for good.
 */
export function hasUnread(thread: ReadState, role: AssistRole): boolean {
  if (!thread.lastMessageAt) return false;
  if (thread.lastMessageRole === role) return false;
  const seen = readAtFor(thread, role);
  return !seen || seen.getTime() < thread.lastMessageAt.getTime();
}

/** Is the thread's next move this person's? */
export function isWaitingOn(status: string, role: AssistRole): boolean {
  if (status === "resolved") return false;
  if (role === "affiliate") return status === "waiting_affiliate" || status === "open";
  if (role === "customer") return status === "waiting_customer";
  return status === "waiting_support";
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

/**
 * The thresholds, in hours, at which an affiliate ought to have done something.
 *
 * Short on anything a person is waiting for, long on anything a warehouse is:
 * a buyer who asked a question yesterday has been ignored, whereas an order
 * placed yesterday is simply an order placed yesterday.
 */
export const FOLLOW_UP_HOURS = {
  /** A customer's message with no answer. */
  reply: 12,
  /** Nickimart has answered an enquiry and the customer has not been told. */
  relay: 12,
  /** A paid order nobody has greeted the buyer about. */
  welcome: 24,
  /** Paid, and the seller has not prepared it. */
  preparing: 72,
  /** On its way, and not arrived. */
  transit: 168,
  /** Delivered, and nobody asked the buyer whether it was alright. */
  delivered: 72,
  /** Cancelled, and nobody offered the buyer a hand. */
  cancelled: 48,
} as const;

/** How long an item keeps asking after the event that raised it. */
const WINDOW_DAYS = { delivered: 14, cancelled: 14 } as const;

export type FollowUpKind =
  | "reply"
  | "relay"
  | "welcome"
  | "delay"
  | "delivered"
  | "cancelled";

export const FOLLOW_UP_LABELS: Record<FollowUpKind, string> = {
  reply: "Reply to a customer",
  relay: "Pass on an answer",
  welcome: "Introduce yourself",
  delay: "Chase an order",
  delivered: "Check it arrived",
  cancelled: "Offer a hand",
};

export interface FollowUpOrder {
  id: string;
  orderNumber: string;
  /** pending | paid | shipped | delivered | cancelled */
  status: string;
  createdAt: Date;
  /** The furthest confirmed shipment stage, and when it was confirmed. */
  stage: string;
  stageAt: Date | null;
  buyer: string;
  /** Whether this affiliate has written to the buyer about this order at all. */
  contacted: boolean;
  /** When they last did. */
  lastContactAt: Date | null;
}

export interface FollowUpThread {
  id: string;
  kind: string;
  status: string;
  topic: string;
  subject: string;
  who: string;
  orderNumber: string | null;
  lastMessageAt: Date | null;
  lastMessageRole: string;
  /** Set when the affiliate has already relayed this answer onward. */
  relayedAt?: Date | null;
}

export interface FollowUpItem {
  /** Encodes the state this item is in, so handling it is not permanent. */
  key: string;
  kind: FollowUpKind;
  title: string;
  detail: string;
  /** "overdue" once the threshold has been passed twice over. */
  urgency: "due" | "overdue";
  /** What started the clock. */
  since: Date;
  orderId: string | null;
  orderNumber: string | null;
  threadId: string | null;
  href: string;
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

function urgencyFor(age: number, threshold: number): "due" | "overdue" {
  return age >= threshold * 2 ? "overdue" : "due";
}

/** Weeks elapsed, so a chased order that stays stuck asks again next week. */
function weekBucket(from: Date, to: Date): number {
  return Math.floor(hoursBetween(from, to) / 168);
}

/**
 * Everything outstanding, worst first.
 *
 * One pass over the orders and one over the threads. An order contributes at
 * most one item, because a list that says three things about the same parcel
 * is a list somebody scrolls past.
 */
export function deriveFollowUps(input: {
  orders: FollowUpOrder[];
  threads: FollowUpThread[];
  handledKeys: readonly string[];
  now: Date;
}): FollowUpItem[] {
  const { orders, threads, now } = input;
  const handled = new Set(input.handledKeys);
  const items: FollowUpItem[] = [];

  for (const t of threads) {
    if (t.status === "resolved" || !t.lastMessageAt) continue;
    const stamp = t.lastMessageAt.getTime();

    // A customer wrote and is waiting.
    if (t.kind === "customer" && t.lastMessageRole === "customer") {
      const age = hoursBetween(t.lastMessageAt, now);
      items.push({
        key: `reply:${t.id}:${stamp}`,
        kind: "reply",
        title: `${t.who} is waiting for an answer`,
        detail: t.subject || TOPIC_LABELS[t.topic] || "A question from your customer",
        urgency: urgencyFor(age, FOLLOW_UP_HOURS.reply),
        since: t.lastMessageAt,
        orderId: null,
        orderNumber: t.orderNumber,
        threadId: t.id,
        href: `/affiliate/messages/${t.id}`,
      });
      continue;
    }

    // Nickimart answered an escalation; the customer has not heard it yet.
    if (t.kind === "support" && t.lastMessageRole === "support" && !t.relayedAt) {
      const age = hoursBetween(t.lastMessageAt, now);
      items.push({
        key: `relay:${t.id}:${stamp}`,
        kind: "relay",
        title: "Nickimart has answered — tell your customer",
        detail: t.subject || "An enquiry you raised has come back",
        urgency: urgencyFor(age, FOLLOW_UP_HOURS.relay),
        since: t.lastMessageAt,
        orderId: null,
        orderNumber: t.orderNumber,
        threadId: t.id,
        href: `/affiliate/messages/${t.id}`,
      });
    }
  }

  for (const o of orders) {
    const item = orderFollowUp(o, now);
    if (item) items.push(item);
  }

  return items
    .filter((i) => !handled.has(i.key))
    .sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency === "overdue" ? -1 : 1;
      return a.since.getTime() - b.since.getTime();
    });
}

/** The one thing this order is asking for, if it is asking for anything. */
function orderFollowUp(o: FollowUpOrder, now: Date): FollowUpItem | null {
  const href = `/affiliate/orders/${o.id}`;
  const base = { orderId: o.id, orderNumber: o.orderNumber, threadId: null, href };

  if (o.status === "cancelled") {
    const since = o.stageAt ?? o.createdAt;
    const age = hoursBetween(since, now);
    if (age > WINDOW_DAYS.cancelled * 24) return null;
    if (o.lastContactAt && o.lastContactAt.getTime() >= since.getTime()) return null;
    if (age < FOLLOW_UP_HOURS.cancelled) return null;
    return {
      ...base,
      key: `cancelled:${o.id}`,
      kind: "cancelled",
      title: `${o.buyer}'s order was cancelled`,
      detail: `${o.orderNumber} — ask whether they would like help ordering again.`,
      urgency: urgencyFor(age, FOLLOW_UP_HOURS.cancelled),
      since,
    };
  }

  if (o.status === "delivered") {
    const since = o.stageAt ?? o.createdAt;
    const age = hoursBetween(since, now);
    if (age > WINDOW_DAYS.delivered * 24) return null;
    if (o.lastContactAt && o.lastContactAt.getTime() >= since.getTime()) return null;
    if (age < FOLLOW_UP_HOURS.delivered) return null;
    return {
      ...base,
      key: `delivered:${o.id}`,
      kind: "delivered",
      title: `Check ${o.buyer} is happy with ${o.orderNumber}`,
      detail: "Delivered. A word now is what turns one order into the next.",
      urgency: urgencyFor(age, FOLLOW_UP_HOURS.delivered),
      since,
    };
  }

  // Nothing is owed on an order that has not been paid for: there is no buyer
  // to help yet and no commission either.
  if (o.status === "pending") return null;

  // Paid, and this affiliate has never said a word to the person who bought
  // through their link.
  if (!o.contacted) {
    const age = hoursBetween(o.createdAt, now);
    if (age >= FOLLOW_UP_HOURS.welcome) {
      return {
        ...base,
        key: `welcome:${o.id}`,
        kind: "welcome",
        title: `Say hello to ${o.buyer}`,
        detail: `${o.orderNumber} came through your link. Tell them you are on hand.`,
        urgency: urgencyFor(age, FOLLOW_UP_HOURS.welcome),
        since: o.createdAt,
      };
    }
  }

  // Stuck: paid and unprepared, or on the move for too long.
  const stuckSince = o.stageAt ?? o.createdAt;
  const age = hoursBetween(stuckSince, now);
  const threshold =
    o.status === "shipped" || o.stage === "in_transit" || o.stage === "out_for_delivery"
      ? FOLLOW_UP_HOURS.transit
      : FOLLOW_UP_HOURS.preparing;
  if (age < threshold) return null;

  return {
    ...base,
    // The week bucket is what makes this re-arm: chasing it today settles
    // today, and if it is still sitting there next week it asks again.
    key: `delay:${o.id}:${o.stage}:${weekBucket(stuckSince, now)}`,
    kind: "delay",
    title: `${o.orderNumber} has not moved`,
    detail:
      threshold === FOLLOW_UP_HOURS.transit
        ? `In transit since ${stuckSince.toDateString()}. Ask Nickimart where it is.`
        : `Paid, not yet prepared. Ask Nickimart whether the shop has it.`,
    urgency: urgencyFor(age, threshold),
    since: stuckSince,
  };
}

// ---------------------------------------------------------------------------
// What an affiliate may see
// ---------------------------------------------------------------------------

/**
 * The buyer, as an affiliate is shown them.
 *
 * A first name and an initial: enough to greet somebody and to recognise a
 * repeat customer, and not a copy of their record. The full name, the address,
 * the phone number and the email stay where they belong — an affiliate talks
 * to a customer through Nickimart, which is also what leaves a record of what
 * was said.
 */
export function assistName(full: string | null | undefined): string {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1).toUpperCase()}.`;
}

/**
 * The fields an affiliate is never shown on an order.
 *
 * Here as a list rather than as a habit: it is the thing a future change is
 * most likely to get wrong, and a named constant is something a reviewer can
 * check a `select` against.
 */
export const WITHHELD_ORDER_FIELDS = [
  "amountPaid",
  "balanceDue",
  "paymentPlan",
  "deliveryFee",
  "total",
  "supplierFreight",
  "internationalFreight",
  "freightLocked",
  "address",
] as const;

/** True when a selection would hand an affiliate something it should not. */
export function leaksWithheldField(selected: readonly string[]): boolean {
  return selected.some((f) => (WITHHELD_ORDER_FIELDS as readonly string[]).includes(f));
}

/** One line summarising where a parcel is, for a list. */
export function stageSummary(orderStatus: string, stage: string): string {
  if (orderStatus === "cancelled") return "Cancelled";
  if (orderStatus === "pending") return "Awaiting payment";
  switch (stage) {
    case "delivered":
      return "Delivered";
    case "out_for_delivery":
      return "Out for delivery";
    case "arrived_ghana":
      return "Arrived in Ghana";
    case "in_transit":
      return "In transit";
    case "at_forwarder":
      return "With the freight forwarder";
    case "processing":
      return "Prepared by the shop";
    default:
      return "Paid — with the shop";
  }
}
