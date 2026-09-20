/**
 * Whether a token still represents the account's current sign-in.
 *
 * Pure and separate from the auth wiring so the decision itself can be tested:
 * it is the whole of what stops two people holding one account, and the three
 * cases that are not a plain match are the ones worth being sure about.
 */

export type SessionVerdict = "current" | "superseded" | "signed-out" | "legacy";

export function sessionVerdict(
  /** The id on the token presented. */
  tokenSid: string | null | undefined,
  /** The id the account currently holds. Null once signed out everywhere. */
  accountSid: string | null | undefined,
): SessionVerdict {
  // A token minted before single sign-in existed carries no id, and cannot be
  // shown to be the current one. Refused, so the hole closes on deploy rather
  // than whenever people happen to sign in again.
  if (!tokenSid) return "legacy";
  if (!accountSid) return "signed-out";
  return tokenSid === accountSid ? "current" : "superseded";
}

/** Only one verdict lets a request through. */
export function sessionAccepted(verdict: SessionVerdict): boolean {
  return verdict === "current";
}
