/**
 * Which channel a second-step code can go to, and how that is said back.
 *
 * Pure, because the answer is needed in three places that cannot share a
 * server module: the sign-in action, the settings card in the browser, and the
 * send itself. A card offering text messages to an account with no number is
 * how somebody locks themselves out.
 */

export type TwoFactorChannel = "email" | "sms";
export type TwoFactorPurpose = "SIGN_IN" | "ENABLE";

export function isChannel(value: string | undefined | null): value is TwoFactorChannel {
  return value === "email" || value === "sms";
}

export interface ChallengeRecipient {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * Where the code went, said in a way that confirms the address without
 * printing it. Somebody who has forgotten which inbox they used needs the
 * reminder; somebody reading over their shoulder should not get the address.
 */
export function channelHint(user: ChallengeRecipient, channel: TwoFactorChannel): string {
  if (channel === "sms") {
    const digits = (user.phone ?? "").replace(/\D/g, "");
    return digits ? `the number ending ${digits.slice(-4)}` : "your phone";
  }
  const [name = "", domain = ""] = (user.email ?? "").split("@");
  return domain ? `${name.slice(0, 2)}${"•".repeat(3)}@${domain}` : "your email";
}

/** A channel the account can actually be reached on, falling back to email. */
export function usableChannel(
  user: ChallengeRecipient,
  preferred: string | null | undefined,
): TwoFactorChannel {
  if (preferred === "sms" && user.phone) return "sms";
  return user.email ? "email" : user.phone ? "sms" : "email";
}
