"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { z } from "zod";
import { dataSignIn, dataSignOut } from "@/lib/data-bundles/auth";
import { signIn as retailSignIn } from "@/lib/auth";
import { tryCompanionSignIn } from "@/lib/companion-session";
import { dataAuth } from "@/lib/data-bundles/auth";
import { dataDb } from "@/lib/data-db";
import { clearDataRateLimit, dataRateLimit } from "@/lib/data-bundles/rate-limit";
import { retryAfterLabel } from "@/lib/rate-limit";
import { findDataUserByIdentifier } from "@/lib/data-bundles/user-lookup";
import { currentLock } from "@/lib/data-bundles/lockout";
import { lockMessage } from "@/lib/data-bundles/lockout-rules";
import { issueDataChallenge, dataChallengeState } from "@/lib/data-bundles/two-factor";
import { usableChannel, type TwoFactorChannel } from "@/lib/two-factor-rules";
import bcrypt from "bcryptjs";
import { DATA_ROLE_HOME, isDataRole } from "@/lib/data-bundles/roles";
import {
  ACCOUNT_UNAVAILABLE,
  WRONG_CODE,
  WRONG_CREDENTIALS,
  signInFailureMessage,
} from "@/lib/auth-failure";

/**
 * Signing in to the bundle business.
 *
 * Deliberately its own action rather than a branch inside the mall's: this one
 * touches the mall nowhere — not the lookup, not the password, not the
 * throttle, not the session claim. That is the property being bought, and a
 * single shared action would have quietly given it back the first time
 * somebody added a line to it.
 *
 * `retryAfterLabel` is imported from the mall's rate-limit module because it
 * is a pure function that turns seconds into English. It reads nothing.
 */

export type DataAuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** What was typed, echoed back. Never the password. */
  values?: { identifier?: string };
  /**
   * Present when the password was right and a code is out. It carries nothing
   * secret: the challenge is useless without the code, and the password is not
   * held anywhere between the two steps.
   */
  twoFactor?: { challengeId: string; channel: TwoFactorChannel; hint: string };
};

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or phone number."),
  password: z.string().min(1, "Enter your password."),
});

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Only same-site relative paths, and only inside this business's consoles. */
function safeCallback(raw: FormDataEntryValue | null): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  // A bundle session is no use on a mall page, and sending somebody there
  // after signing in here would look like a broken sign-in rather than the
  // two separate accounts it actually is.
  return s === "/agent" || s.startsWith("/agent/") || s.startsWith("/admin/data") ? s : null;
}

export async function dataLoginAction(
  _prev: DataAuthFormState,
  formData: FormData,
): Promise<DataAuthFormState> {
  const typed = String(formData.get("identifier") ?? "").trim();
  const values = { identifier: typed };

  const parsed = schema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }

  const identifier = parsed.data.identifier;

  // Per account and per address, so one attacker cannot spread across accounts
  // and one account cannot be locked out cheaply from a single address.
  const accountKey = `data-login:id:${identifier.toLowerCase()}`;
  const ipKey = `data-login:ip:${await clientIp()}`;
  const [perAccount, perIp] = await Promise.all([
    dataRateLimit(accountKey, 8, 15 * 60 * 1000),
    dataRateLimit(ipKey, 30, 15 * 60 * 1000),
  ]);
  if (!perAccount.ok || !perIp.ok) {
    const wait = Math.max(perAccount.retryAfter, perIp.retryAfter);
    return {
      error: `Too many sign-in attempts. Please try again in ${retryAfterLabel(wait)}.`,
      values,
    };
  }

  // Looked up here as well as inside the provider, to decide where to land
  // them and to say something true when the account is locked. A failure is
  // the database, not the password, and says so.
  let home = "/agent";
  let account: Awaited<ReturnType<typeof findDataUserByIdentifier>> = null;
  try {
    account = await findDataUserByIdentifier(identifier);
    if (account && isDataRole(account.role)) home = DATA_ROLE_HOME[account.role];
  } catch (error) {
    console.error("[data-auth] sign-in lookup failed:", error);
    return { error: ACCOUNT_UNAVAILABLE, values };
  }

  // The lock is enforced in the provider; this is only so the screen can say
  // how long rather than "invalid email or password", which would send
  // somebody to reset a password that is perfectly correct.
  if (account) {
    const lock = await currentLock(account.id);
    if (lock) return { error: lockMessage(lock), values };
  }

  const redirectTo = safeCallback(formData.get("callbackUrl")) ?? home;

  // An account that asks for a code gets its password checked here rather than
  // inside the provider, because what follows is a code rather than a session.
  // The same wrong-password wording either way: which accounts have a second
  // step is not something a sign-in form should disclose.
  if (account?.twoFactorEnabled && account.passwordHash) {
    if (!(await bcrypt.compare(parsed.data.password, account.passwordHash))) {
      // Wrong password on a 2FA account still counts toward the lock; the
      // provider never sees this attempt, so it is recorded here instead.
      const { recordFailure } = await import("@/lib/data-bundles/lockout");
      const locked = await recordFailure({
        id: account.id,
        email: account.email,
        name: account.name,
      });
      return { error: locked ? lockMessage(locked) : WRONG_CREDENTIALS, values };
    }

    const channel = usableChannel(account, account.twoFactorChannel);
    let challenge;
    try {
      challenge = await issueDataChallenge(account, "SIGN_IN", channel);
    } catch (error) {
      console.error("[data-auth] could not issue a sign-in code:", error);
      return { error: ACCOUNT_UNAVAILABLE, values };
    }
    // The password was right, so the guessing counters have done their job.
    await clearDataRateLimit(accountKey);
    return { values, twoFactor: challenge };
  }

  // The mall side too, for somebody who holds both. Attempted, never
  // required: this console must keep working when the mall is away, which is
  // the whole reason it has its own accounts.
  await tryCompanionSignIn(retailSignIn, "credentials", {
    email: identifier,
    password: parsed.data.password,
  });

  try {
    await dataSignIn("data-credentials", {
      identifier,
      password: parsed.data.password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // The same distinction the mall's sign-in makes: `authorize` returning
      // null is a rejected credential, `authorize` throwing is this database,
      // and reporting the second as the first sends somebody to reset a
      // password that was never the problem.
      if (error.type !== "CredentialsSignin") {
        console.error("[data-auth] sign-in failed before the password could be judged:", error);
      }
      return { error: signInFailureMessage(error.type, WRONG_CREDENTIALS), values };
    }
    // dataSignIn throws NEXT_REDIRECT on success — the attempt worked, so the
    // counters are cleared before re-throwing so navigation still happens.
    await clearDataRateLimit(accountKey);
    await clearDataRateLimit(ipKey);
    throw error;
  }

  return {};
}

const EXPIRED = "That code has expired. Enter your password again to get a new one.";

/**
 * The second step: spend the code and finish signing in.
 *
 * Rate-limited in its own right. The five attempts on the challenge stop one
 * code being brute-forced; this stops somebody churning through challenges to
 * get five fresh guesses at a time.
 */
export async function dataVerifyTwoFactorAction(
  _prev: DataAuthFormState,
  formData: FormData,
): Promise<DataAuthFormState> {
  const challengeId = String(formData.get("challengeId") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const channel = String(formData.get("channel") ?? "email") as TwoFactorChannel;
  const hint = String(formData.get("hint") ?? "");
  const again: DataAuthFormState = { twoFactor: { challengeId, channel, hint } };

  if (!challengeId) return { error: EXPIRED };
  if (!/^\d{6}$/.test(code)) {
    return { ...again, error: "Enter the 6-digit code.", fieldErrors: { code: "6 digits." } };
  }

  const limit = await dataRateLimit(`data-2fa:ip:${await clientIp()}`, 20, 15 * 60 * 1000);
  if (!limit.ok) {
    return { error: `Too many attempts. Please try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  // Read-only, so the screen can say "expired" rather than "incorrect" without
  // spending one of the five attempts to find out — and can tell a database
  // that did not answer apart from a code that is actually wrong.
  const state = await dataChallengeState(challengeId, "SIGN_IN");
  if (state === "unavailable") return { ...again, error: ACCOUNT_UNAVAILABLE };
  if (state === "missing" || state === "expired") return { error: EXPIRED };
  if (state === "locked") {
    return { error: "Too many wrong codes. Enter your password again to start over." };
  }

  const redirectTo = safeCallback(formData.get("callbackUrl")) ?? "/agent";
  try {
    await dataSignIn("data-two-factor", { challengeId, code, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type !== "CredentialsSignin") {
        console.error("[data-auth] the code could not be checked:", error);
        return { ...again, error: ACCOUNT_UNAVAILABLE };
      }
      return { ...again, error: WRONG_CODE, fieldErrors: { code: "Incorrect." } };
    }
    throw error; // NEXT_REDIRECT — the code was right
  }

  return {};
}

export async function dataLogoutAction() {
  // Release the account's session before the cookie goes, so the token that
  // was just signed out cannot be replayed from a copy of it.
  const session = await dataAuth().catch(() => null);
  const userId = session?.user?.id;
  if (userId) {
    await dataDb.dataUser
      .update({ where: { id: userId }, data: { activeSessionId: null } })
      .catch(() => undefined);
  }
  await dataSignOut({ redirectTo: "/agent-login" });
}
