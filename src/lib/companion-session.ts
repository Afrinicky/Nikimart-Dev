import "server-only";

/**
 * Signing in once, for somebody who holds both accounts.
 *
 * The two businesses keep separate accounts, which is the point of the split
 * — but the administrator who runs both, and the agent who also shops, are one
 * person with one password, and making them sign in twice to walk from one
 * console to the other is the split leaking into their day. "I am logged out
 * when I move from retail to the data console" is exactly that.
 *
 * So a successful sign-in on one side quietly attempts the other, with the
 * credentials already in hand. It is attempted, never required: the companion
 * database may be the one that is down, and the sign-in that actually
 * succeeded must not be undone by the one that could not.
 *
 * What makes this safe rather than a hole
 * ---------------------------------------
 * It goes through the other side's own credentials provider, not around it.
 * That provider refuses an account with a second step and refuses one that is
 * locked out — so an account protected by either is never signed in by the
 * side door, and the person is sent through the proper one. Nothing here
 * weakens a control; it only spares somebody typing the same password twice
 * into two forms.
 */
export async function tryCompanionSignIn(
  signIn: (provider: string, options: Record<string, unknown>) => Promise<unknown>,
  provider: string,
  credentials: Record<string, string>,
): Promise<"signed-in" | "declined"> {
  try {
    // `redirect: false` because this is the *second* sign-in of the request —
    // the first one owns where the person lands.
    await signIn(provider, { ...credentials, redirect: false });
    return "signed-in";
  } catch {
    // Wrong password on that side, a second step, a lock, or that database
    // being away. All of them mean "not this time", and none of them is a
    // reason to fail the sign-in that worked.
    return "declined";
  }
}
