import "server-only";

/**
 * The server side of the registration terms gate.
 *
 * A ticked box is a claim the browser makes, and anything that posts a form can
 * make it without one. Consent is worth recording, so every registration action
 * checks the value again and stores when it was given rather than merely that
 * it was — "they agreed" is only useful with a date attached to it.
 */

export const TERMS_REQUIRED_MESSAGE =
  "Please read and accept the terms before continuing.";

/** True when the acceptance checkbox came back ticked. */
export function termsAccepted(fd: FormData): boolean {
  const raw = fd.get("acceptTerms");
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "yes" || value === "on" || value === "true";
}
