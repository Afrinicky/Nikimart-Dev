/**
 * What the sign-in form says when it cannot sign somebody in.
 *
 * There are two different failures behind one screen, and telling them apart
 * is the whole point of this file. "Your password is wrong" is something the
 * person can act on. "We could not reach your account" is not their fault and
 * not their problem to solve — it is something to say plainly and let them
 * try again a moment later.
 *
 * Saying the first when the second is true is the expensive mistake: an
 * administrator told their password is wrong goes and resets a password that
 * worked perfectly, and now cannot get in for a reason that has nothing to do
 * with the outage that started it.
 *
 * Pure and string-only, with no Auth.js or Prisma import, so it is tested
 * rather than guessed at.
 */

/** The database, not the person, is the reason. Always safe to retry. */
export const ACCOUNT_UNAVAILABLE =
  "We couldn't reach your account just now. Please try again in a moment.";

/**
 * The password did not match — or the account does not exist, or it wants a
 * code. One sentence for all three on purpose: which accounts exist, and
 * which of them ask for a second step, is not something a sign-in form
 * should disclose.
 */
export const WRONG_CREDENTIALS = "Invalid email or password.";

/** The same two cases, for the screen that asks for the code. */
export const WRONG_CODE = "Incorrect code.";

/**
 * Auth.js reports both failures by throwing the same `AuthError`, told apart
 * only by its `type`: an `authorize` callback that *returns null* is a
 * rejected credential and arrives as `CredentialsSignin`, while an
 * `authorize` callback that *throws* — a Prisma timeout, a Neon instance
 * still waking up, a connection refused — is wrapped and arrives as
 * `CallbackRouteError`. Reading only `instanceof AuthError` collapses the two
 * and reports an outage as a bad password.
 */
export function signInFailureMessage(type: string, rejected = WRONG_CREDENTIALS): string {
  return type === "CredentialsSignin" ? rejected : ACCOUNT_UNAVAILABLE;
}
