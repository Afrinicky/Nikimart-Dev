import { toLocalGhPhone } from "../networks.ts";

/**
 * Phone numbers as MTN's Customer Transfer API wants them.
 *
 * The rest of Nickimart stores and shows a Ghana number in its local form,
 * `0XXXXXXXXX`, because that is what buyers type and what the existing data
 * provider explicitly demands — it rejects anything carrying a +233 or 233
 * prefix. MADAPI is the other way round: its MSISDNs are international,
 * `233XXXXXXXXX`, with no plus.
 *
 * Two formats for the same number, one of them wrong on each side of the
 * fence. So the conversion lives here, on its own, with tests — and nothing
 * above this module has to remember which API it is talking to.
 *
 * The format is configurable rather than fixed because MADAPI is provisioned
 * per account and the specification does not state which form a given account
 * expects. An account that wants the local form can be switched in the
 * Developer tab without a deploy, which is the difference between a five
 * minute fix and an evening of failed orders.
 *
 * Pure module — no `server-only` — so the admin console, the client and the
 * tests all agree on one answer.
 */

/** How this MTN account writes a subscriber number. */
export const MSISDN_FORMATS = ["INTERNATIONAL", "LOCAL"] as const;
export type MsisdnFormat = (typeof MSISDN_FORMATS)[number];

/** Ghana's country calling code, without the plus MADAPI does not want. */
const GH_COUNTRY_CODE = "233";

export function isMsisdnFormat(value: unknown): value is MsisdnFormat {
  return typeof value === "string" && (MSISDN_FORMATS as readonly string[]).includes(value);
}

/** Read a stored setting as a format. Anything unrecognised means international. */
export function normaliseMsisdnFormat(raw: string | null | undefined): MsisdnFormat {
  const value = (raw ?? "").trim().toUpperCase();
  return isMsisdnFormat(value) ? value : "INTERNATIONAL";
}

/**
 * A Ghana number in the form this MTN account expects, or null when the input
 * cannot be a Ghana mobile number at all.
 *
 * Everything funnels through `toLocalGhPhone` first, so the one set of rules
 * about what counts as a Ghana number is applied here too rather than
 * reimplemented beside it.
 */
export function toMtnMsisdn(
  input: string | null | undefined,
  format: MsisdnFormat = "INTERNATIONAL",
): string | null {
  const local = toLocalGhPhone(input);
  if (!local) return null;
  // local is guaranteed 0XXXXXXXXX by toLocalGhPhone.
  return format === "LOCAL" ? local : `${GH_COUNTRY_CODE}${local.slice(1)}`;
}

/**
 * Back to the local form, for anything MTN hands us that we then store or
 * show — a `receiverMsisdn` echoed on a transfer response, say, which has to
 * match the `recipientPhone` already on the order.
 */
export function fromMtnMsisdn(input: string | null | undefined): string | null {
  return toLocalGhPhone(input);
}

/**
 * True when two numbers are the same subscriber, whatever form each is in.
 *
 * Used to check that a callback is talking about the order we think it is:
 * comparing the strings directly would call `233241234567` and `0241234567`
 * different people.
 */
export function sameSubscriber(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = toLocalGhPhone(a);
  const right = toLocalGhPhone(b);
  return left !== null && left === right;
}
