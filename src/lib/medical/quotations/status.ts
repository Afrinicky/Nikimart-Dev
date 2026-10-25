/**
 * A quotation's life, and which moves are legal from where.
 *
 * Written as a table rather than as conditions at each call site because there
 * are ten states and six screens that act on them, and the one thing worse
 * than a quotation nobody can advance is a quotation two screens disagree
 * about. The table is the single answer, and the server action and the button
 * both read it.
 *
 * The rule that shapes everything else: **an issued document is frozen.** Once
 * a version is issued, its lines, prices and totals are read-only, because a
 * customer has a copy and a document that changes after it has been sent is not
 * a document. A price that has to change becomes a new version that supersedes
 * this one, with the reason recorded — which is why `REVISE` exists and
 * `EDIT` stops being legal at `ISSUED`.
 *
 * Pure, so it can be tested and so the page guard and the action cannot drift.
 */

export const QUOTATION_STATUSES = [
  "DRAFT",
  "ISSUED",
  "SENT",
  "VIEWED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "SUPERSEDED",
  "CONVERTED",
  "CANCELLED",
] as const;

export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

/**
 * The statuses a *request* moves through — the question, not the answer.
 *
 * A separate set from the one above, because a request and a quotation are
 * different records with different lives. Here rather than inside an action
 * module so that the console's vocabulary, the customer's vocabulary and the
 * validation that rejects an unknown status all read from one list.
 */
export const REQUEST_STATUSES = [
  "NEW",
  "UNDER_REVIEW",
  "AWAITING_SUPPLIER",
  "DRAFTING",
  "SENT",
  "REVISION_REQUESTED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "CONVERTED",
  "CANCELLED",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && (REQUEST_STATUSES as readonly string[]).includes(value);
}

/**
 * The things that can be done to a quotation.
 *
 * `EDIT` covers changing lines, prices and terms — everything the draft editor
 * does. The rest are single transitions.
 */
export type QuotationMove =
  | "EDIT"
  | "ISSUE"
  | "SEND"
  | "ACCEPT"
  | "DECLINE"
  | "REVISE"
  | "CONVERT"
  | "CANCEL";

/**
 * What is legal from each state.
 *
 * Read down the list and the shape of the thing is visible: a draft can be
 * edited and issued and nothing else; an issued or sent document can be
 * answered, revised or cancelled but never edited; and the four end states
 * (`ACCEPTED` aside) permit nothing at all, because a declined, expired,
 * superseded or cancelled document is history.
 *
 * `VIEWED` behaves exactly as `SENT` does: knowing the customer opened it is
 * useful to a salesperson and changes nothing about what may be done.
 */
const LEGAL: Record<QuotationStatus, readonly QuotationMove[]> = {
  DRAFT: ["EDIT", "ISSUE", "CANCEL"],
  ISSUED: ["SEND", "ACCEPT", "DECLINE", "REVISE", "CANCEL"],
  SENT: ["ACCEPT", "DECLINE", "REVISE", "CANCEL"],
  VIEWED: ["ACCEPT", "DECLINE", "REVISE", "CANCEL"],
  // Accepted and not yet converted: the one order still outstanding. It can
  // still be cancelled, because a customer who accepts and then withdraws is an
  // ordinary thing and the alternative is an order nobody wanted.
  ACCEPTED: ["CONVERT", "CANCEL"],
  DECLINED: [],
  EXPIRED: [],
  SUPERSEDED: [],
  CONVERTED: [],
  CANCELLED: [],
};

export function isQuotationStatus(value: unknown): value is QuotationStatus {
  return typeof value === "string" && (QUOTATION_STATUSES as readonly string[]).includes(value);
}

export function can(status: QuotationStatus, move: QuotationMove): boolean {
  return LEGAL[status].includes(move);
}

export function movesFrom(status: QuotationStatus): readonly QuotationMove[] {
  return LEGAL[status];
}

/** Whether the document's lines and totals are still editable. */
export function isEditable(status: QuotationStatus): boolean {
  return can(status, "EDIT");
}

/** Whether this is an end state — nothing further can be done to it. */
export function isClosed(status: QuotationStatus): boolean {
  return LEGAL[status].length === 0;
}

/**
 * What a quotation is waiting for, in words.
 *
 * The queue's whole purpose: a list of documents is useless without the column
 * that says whose move it is. Phrased as the action somebody takes, not as the
 * state it is in.
 */
export function nextAction(status: QuotationStatus): string {
  switch (status) {
    case "DRAFT":
      return "Price the lines and issue it";
    case "ISSUED":
      return "Send it to the customer";
    case "SENT":
      return "Waiting on the customer";
    case "VIEWED":
      return "They have read it — follow up";
    case "ACCEPTED":
      return "Convert it to an order";
    case "DECLINED":
      return "Declined";
    case "EXPIRED":
      return "Lapsed — revise it if it is still wanted";
    case "SUPERSEDED":
      return "Replaced by a later version";
    case "CONVERTED":
      return "Done — an order was raised";
    case "CANCELLED":
      return "Cancelled";
  }
}

/**
 * Whether a quotation has lapsed on a given day.
 *
 * Computed rather than relied on from the status, because nothing runs at
 * midnight to sweep them: a quotation with yesterday's validity date is
 * expired whether or not a job has been round to say so, and a screen that
 * waits for the sweep shows a price that is no longer on offer.
 *
 * `validUntil` is treated as inclusive — a quotation valid until the 30th is
 * good on the 30th.
 */
export function hasLapsed(
  quotation: { status: string; validUntil: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (!quotation.validUntil) return false;
  if (!isQuotationStatus(quotation.status)) return false;
  // Only a live document can lapse. An accepted one is an agreement and a
  // declined one is already closed.
  if (!(["ISSUED", "SENT", "VIEWED"] as readonly string[]).includes(quotation.status)) return false;

  const until = quotation.validUntil instanceof Date
    ? quotation.validUntil
    : new Date(quotation.validUntil);
  if (Number.isNaN(until.getTime())) return false;

  return endOfDay(until).getTime() < now.getTime();
}

/** The status to display, which accounts for a lapse nothing has swept yet. */
export function effectiveStatus(quotation: {
  status: string;
  validUntil: Date | string | null;
}, now: Date = new Date()): QuotationStatus {
  if (hasLapsed(quotation, now)) return "EXPIRED";
  return isQuotationStatus(quotation.status) ? quotation.status : "DRAFT";
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
