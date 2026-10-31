"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { z } from "zod";
import { dataSignIn, dataSignOut } from "@/lib/data-bundles/auth";
import { dataAuth } from "@/lib/data-bundles/auth";
import { dataDb } from "@/lib/data-db";
import { clearDataRateLimit, dataRateLimit } from "@/lib/data-bundles/rate-limit";
import { retryAfterLabel } from "@/lib/rate-limit";
import { findDataUserByIdentifier } from "@/lib/data-bundles/user-lookup";
import { DATA_ROLE_HOME, isDataRole } from "@/lib/data-bundles/roles";
import {
  ACCOUNT_UNAVAILABLE,
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

  // Looked up here as well as inside the provider, only to decide where to
  // land them. A failure is the database, not the password, and says so.
  let home = "/agent";
  try {
    const user = await findDataUserByIdentifier(identifier);
    if (user && isDataRole(user.role)) home = DATA_ROLE_HOME[user.role];
  } catch (error) {
    console.error("[data-auth] sign-in lookup failed:", error);
    return { error: ACCOUNT_UNAVAILABLE, values };
  }

  const redirectTo = safeCallback(formData.get("callbackUrl")) ?? home;

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
