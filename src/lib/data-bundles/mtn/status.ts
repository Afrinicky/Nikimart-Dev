import type { DataOrderStatus } from "../networks.ts";

/**
 * Reading MTN's answer to "did the data land?".
 *
 * The existing provider replies in one word — QUEUED, PENDING, COMPLETED —
 * and `mapProviderStatus` turns that into our vocabulary. MADAPI answers in
 * two parts that have to be read together:
 *
 *   statusCode        whether the *request* was accepted. "0000" and the 2xx
 *                     family mean MTN took it; anything else is a rejection,
 *                     and the transfer never happened.
 *   transactionState  what became of the transfer itself, once accepted.
 *
 * Reading only one of them gets it wrong in both directions. A successful
 * statusCode with a PENDING state is not a delivered bundle; a FAILED state
 * under a 2xx is not a success just because the HTTP call worked. So the code
 * decides whether there is anything to interpret, and the state decides what
 * happened.
 *
 * The bias throughout is the one `mapProviderStatus` already takes: when it is
 * genuinely unclear, call it in-flight rather than finished. A bundle wrongly
 * marked delivered pays commission on data nobody received and stops the sync
 * ever looking again, because `applyProviderStatus` makes completion sticky.
 * A bundle wrongly left processing costs one more status read.
 *
 * Pure module, so the client, the callback route and the tests all read a
 * reply the same way.
 */

/** Status codes that mean "MTN accepted this request". */
const ACCEPTED_CODES = new Set(["0", "00", "000", "0000", "200", "201", "202"]);

/**
 * Transaction states that mean the transfer is finished and the data is there.
 * `SUCCESS`/`SUCCESSFUL` are MADAPI's usual words; the rest are included
 * because the same platform is documented with different vocabulary per
 * market and a delivered bundle must not read as merely in-flight.
 */
const DELIVERED_STATES = new Set([
  "SUCCESS",
  "SUCCESSFUL",
  "COMPLETED",
  "COMPLETE",
  "DELIVERED",
  "APPROVED",
  "CONFIRMED",
]);

/** States that mean it is over and the data did not land. */
const FAILED_STATES = new Set([
  "FAILED",
  "FAILURE",
  "UNSUCCESSFUL",
  "REJECTED",
  "DECLINED",
  "DENIED",
  "CANCELLED",
  "CANCELED",
  "EXPIRED",
  "TIMEOUT",
  "TIMED_OUT",
  "ERROR",
]);

/**
 * Accepted upstream, not yet started — and, crucially, waiting on a person.
 *
 * MADAPI can require the subscriber to approve a transfer out of their own
 * balance, which is what the consent notification callback is for. That wait
 * is not us processing anything: it is an order sitting still until somebody
 * taps a prompt on a handset, which can be minutes. "Queued" is the state we
 * already have for exactly that — accepted, not started, still stoppable.
 */
const QUEUED_STATES = new Set([
  "QUEUED",
  "ACCEPTED",
  "SUBMITTED",
  "AWAITING_CONSENT",
  "AWAITINGCONSENT",
  "PENDING_CONSENT",
  "PENDINGCONSENT",
  "CONSENT_PENDING",
  "INITIATED",
]);

function normalise(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "_") : "";
}

/** True when the status code says MTN took the request at all. */
export function isAcceptedStatusCode(statusCode: string | null | undefined): boolean {
  const code = (statusCode ?? "").trim();
  if (code === "") return false;
  if (ACCEPTED_CODES.has(code)) return true;
  // Some markets answer with a bare HTTP-like code. Treat the 2xx family as
  // acceptance and everything else as a rejection.
  const numeric = Number(code);
  return Number.isInteger(numeric) && numeric >= 200 && numeric < 300;
}

export interface MtnStatusInput {
  /** The envelope's `statusCode` — whether the request itself was accepted. */
  statusCode?: string | null;
  /** `data.transactionState` — what became of the transfer. */
  transactionState?: string | null;
}

/**
 * One MTN reply, in our vocabulary.
 *
 * A rejected status code is terminal: MTN did not take the request, so there
 * is no transfer to wait for and nothing will change later. An accepted one
 * hands the decision to the transaction state, and a reply that carries no
 * state at all is read as processing — accepted, outcome not yet known, ask
 * again.
 */
export function mapMtnStatus(input: MtnStatusInput): DataOrderStatus {
  const state = normalise(input.transactionState);

  // A terminal state is terminal whatever else the envelope says: a reply that
  // reports the transfer failed has told us the outcome, and reading the code
  // over the top of it would turn a known failure into "ask again forever".
  if (DELIVERED_STATES.has(state)) return "completed";
  if (FAILED_STATES.has(state)) return "failed";

  if (!isAcceptedStatusCode(input.statusCode)) return "failed";

  if (QUEUED_STATES.has(state)) return "queued";

  // Accepted, and either working on it or silent about it. Both are in-flight.
  return "processing";
}

/**
 * The line an admin reads on the order.
 *
 * MADAPI sends three of them — `statusMessage` for people, `supportMessage`
 * for whoever is diagnosing it, and a `downstreamStatusCode` from whatever sat
 * behind the gateway. Each is useless on its own at 3am and they are kept
 * together here, trimmed to what the column holds.
 */
export function mtnMessage(input: {
  statusCode?: string | null;
  statusMessage?: string | null;
  supportMessage?: string | null;
  downstreamStatusCode?: number | string | null;
  transactionState?: string | null;
}): string {
  const parts: string[] = [];
  if (input.statusMessage) parts.push(String(input.statusMessage));
  if (input.transactionState) parts.push(`state ${input.transactionState}`);
  if (input.statusCode) parts.push(`code ${input.statusCode}`);
  if (input.supportMessage && input.supportMessage !== input.statusMessage) {
    parts.push(String(input.supportMessage));
  }
  if (input.downstreamStatusCode !== null && input.downstreamStatusCode !== undefined) {
    parts.push(`downstream ${input.downstreamStatusCode}`);
  }
  return parts.join(" · ").slice(0, 500) || "No message from MTN.";
}

/**
 * What the transfer actually cost, in GH₵, from the `valueCharged` and `unit`
 * MTN reports.
 *
 * This is the one number the margin report cannot guess at, and the unit is
 * the whole difficulty: a transfer billed in pesewas and read as cedis
 * overstates the cost a hundredfold, which would turn every MTN sale on the
 * report into a loss. So only units we actually recognise are converted, and
 * anything else returns null — no figure at all is better than a wrong one,
 * because `costPrice` is left as the ladder's own number when this is null.
 *
 * A data transfer is charged in volume rather than money on some accounts
 * (`unit: "MB"`), and that is not a cost in cedis either — it is also null.
 */
export function mtnValueCharged(
  valueCharged: unknown,
  unit: string | null | undefined,
): number | null {
  const raw = typeof valueCharged === "number" ? valueCharged : Number(valueCharged);
  if (!Number.isFinite(raw) || raw < 0) return null;

  switch (normalise(unit)) {
    case "GHS":
    case "GHC":
    case "CEDI":
    case "CEDIS":
      return Math.round(raw * 100) / 100;
    case "PESEWA":
    case "PESEWAS":
      return Math.round(raw) / 100;
    default:
      // MB, GB, "UNITS", or nothing at all — not a price in cedis.
      return null;
  }
}
