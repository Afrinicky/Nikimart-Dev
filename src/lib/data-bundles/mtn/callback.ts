import type { DataOrderStatus } from "../networks.ts";
import { mapMtnStatus, mtnMessage } from "./status.ts";

/**
 * Reading what MTN posts back.
 *
 * Two different things arrive at the same callback URL, and they are not the
 * same shape:
 *
 *   the transfer result   the CustomerTransferResponse envelope — a
 *                         `statusCode` and a `data.transactionState`.
 *   a consent decision    the specification's ConsentNotificationResponse —
 *                         `msisdn`, `userResponse` and little else. It is sent
 *                         when a transfer needs the subscriber to approve it,
 *                         and it says what they tapped, not what became of the
 *                         transfer afterwards.
 *
 * Conflating them is the trap. A consent *approval* is not a delivered bundle:
 * the transfer is only beginning at that point, and marking the order complete
 * there would pay commission on data that has not moved and — because
 * completion is sticky — stop anything ever checking again. So an approval
 * leaves the order in flight and only a refusal is terminal.
 *
 * Pure module so the route stays thin and this can be tested directly.
 */

export type CallbackKind = "transfer" | "consent" | "unknown";

export interface CallbackReading {
  kind: CallbackKind;
  /** What the order should become, or null when the body says nothing useful. */
  status: DataOrderStatus | null;
  /** The upstream word to store for display. */
  providerStatus: string | null;
  message: string;
}

/** Consent answers that mean "go ahead". */
const CONSENT_APPROVED = new Set(["APPROVED", "ACCEPT", "ACCEPTED", "YES", "Y", "TRUE", "CONSENTED", "GRANTED"]);
/** Consent answers that mean "no". */
const CONSENT_REFUSED = new Set(["DECLINED", "DENIED", "REJECTED", "NO", "N", "FALSE", "CANCELLED", "CANCELED", "TIMEOUT", "EXPIRED"]);

function word(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "_") : "";
}

export interface CallbackBody {
  statusCode?: string | null;
  statusMessage?: string | null;
  supportMessage?: string | null;
  downstreamStatusCode?: number | string | null;
  transactionId?: string | null;
  sequenceNo?: string | null;
  /** Present on a consent notification, and only there. */
  userResponse?: string | null;
  msisdn?: string | null;
  partnerName?: string | null;
  data?: {
    transactionState?: string | null;
    receiverMsisdn?: string | null;
    valueCharged?: number | null;
    unit?: string | null;
  } | null;
  /** Some gateways post the state flat rather than under `data`. */
  transactionState?: string | null;
}

export function readCallback(body: CallbackBody | null | undefined): CallbackReading {
  if (!body || typeof body !== "object") {
    return { kind: "unknown", status: null, providerStatus: null, message: "Empty callback." };
  }

  // A consent decision is recognised by `userResponse`, which the transfer
  // envelope never carries.
  if (typeof body.userResponse === "string" && body.userResponse.trim() !== "") {
    const answer = word(body.userResponse);
    if (CONSENT_REFUSED.has(answer)) {
      return {
        kind: "consent",
        status: "failed",
        providerStatus: body.userResponse,
        message: `The subscriber declined the transfer (${body.userResponse}).`,
      };
    }
    if (CONSENT_APPROVED.has(answer)) {
      // Approved is the *start* of the transfer, not the end of it.
      return {
        kind: "consent",
        status: "processing",
        providerStatus: body.userResponse,
        message: `Consent granted (${body.userResponse}); waiting for the transfer to complete.`,
      };
    }
    return {
      kind: "consent",
      status: null,
      providerStatus: body.userResponse,
      message: `Consent response not understood (${body.userResponse}).`,
    };
  }

  const transactionState = body.data?.transactionState ?? body.transactionState ?? null;
  if (!transactionState && !body.statusCode) {
    return {
      kind: "unknown",
      status: null,
      providerStatus: null,
      message: "Callback carried no status.",
    };
  }

  return {
    kind: "transfer",
    status: mapMtnStatus({ statusCode: body.statusCode, transactionState }),
    providerStatus: transactionState ?? body.statusCode ?? null,
    message: mtnMessage({
      statusCode: body.statusCode,
      statusMessage: body.statusMessage,
      supportMessage: body.supportMessage,
      downstreamStatusCode: body.downstreamStatusCode,
      transactionState,
    }),
  };
}
