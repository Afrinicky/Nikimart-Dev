"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth, signIn, signOut } from "@/lib/auth";
import { termsAccepted, TERMS_REQUIRED_MESSAGE } from "@/lib/terms";
import { prisma } from "@/lib/prisma";
import { isRole, ROLE_HOME } from "@/lib/roles";
import { findUserByIdentifier } from "@/lib/user-lookup";
import { isAgentUser } from "@/lib/data-bundles/agents";
import { clearRateLimit, rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { challengeState, issueChallenge } from "@/lib/two-factor";
import { usableChannel, type TwoFactorChannel } from "@/lib/two-factor-rules";

/** Best-effort client IP, for rate-limiting keys. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /**
   * What was typed, echoed back so a rejected attempt doesn't empty the form.
   * Never the password: it goes back down the wire into the HTML, and the one
   * field nobody should have to retype is also the one field that must not be
   * sent back.
   */
  values?: { email?: string; name?: string; phone?: string };
  /**
   * Present when the password was right and a code has been sent. It carries
   * nothing secret: the challenge is useless without the code, and the
   * password is not held anywhere between the two steps.
   */
  twoFactor?: { challengeId: string; channel: TwoFactorChannel; hint: string };
};

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  password: z.string().min(8, "Password must be at least 8 characters."),
  address: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  preferredPickupId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
});

const loginSchema = z.object({
  // Email address or phone number.
  email: z.string().trim().min(1, "Enter your email or phone number."),
  password: z.string().min(1, "Enter your password."),
});

function homeForRole(role: string | undefined) {
  return role && isRole(role) ? ROLE_HOME[role] : "/account";
}

/**
 * Where signing in should land this account.
 *
 * Reselling data is the thing an agent signs in to do. Sending them to the
 * customer account page first and asking them to find their own console made
 * every session two steps long, so membership of the agent programme wins over
 * the role's own dashboard — with one exception: staff keep theirs, because an
 * admin who also holds a storefront is signing in to run the site.
 */
async function homeForUser(user: { id: string; role: string } | null): Promise<string> {
  if (!user) return "/account";
  if (user.role === "CUSTOMER" && (await isAgentUser(user.id))) return "/agent";
  return homeForRole(user.role);
}

/** Only allow same-site relative paths as a post-auth redirect target. */
function safeCallback(raw: FormDataEntryValue | null): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : null;
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
  };

  // Consent is checked before anything else: nothing about this person should
  // be written down until they have agreed to the terms it is kept under.
  if (!termsAccepted(formData)) {
    return {
      error: TERMS_REQUIRED_MESSAGE,
      fieldErrors: { acceptTerms: TERMS_REQUIRED_MESSAGE },
      values,
    };
  }

  // `formData.get` returns null for a field that isn't in the DOM, and a zod
  // `.optional()` rejects null — it means "absent", not "empty". The pickup
  // select is only rendered when there are pickup points to choose from, so on
  // a site with none it was absent, arrived as null, and failed the schema:
  // registration was impossible and the form said only "fix the highlighted
  // fields", with nothing highlighted. Absent and empty both mean "not given".
  const field = (name: string) => {
    const raw = formData.get(name);
    return typeof raw === "string" ? raw : undefined;
  };

  const parsed = registerSchema.safeParse({
    name: field("name"),
    email: field("email"),
    phone: field("phone"),
    password: field("password"),
    address: field("address"),
    preferredPickupId: field("preferredPickupId"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }

  // Cap sign-ups from one address so the register form can't be used to bulk
  // create accounts (or to probe which emails are already taken).
  const signupLimit = await rateLimit(`register:ip:${await clientIp()}`, 5, 60 * 60 * 1000);
  if (!signupLimit.ok) {
    return {
      error: `Too many accounts created from here. Please try again in ${retryAfterLabel(signupLimit.retryAfter)}.`,
      values,
    };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      error: "An account with that email already exists.",
      fieldErrors: { email: "Email already registered." },
      values,
    };
  }

  // Only honour a preferred pickup that actually exists (avoid an FK error).
  let preferredPickupId: string | null = null;
  if (parsed.data.preferredPickupId) {
    const pp = await prisma.pickupPoint.findFirst({
      where: { id: parsed.data.preferredPickupId, isActive: true },
      select: { id: true },
    });
    preferredPickupId = pp?.id ?? null;
  }

  const callbackUrl = safeCallback(formData.get("callbackUrl")) ?? "/account";
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      phone: parsed.data.phone ?? null,
      passwordHash,
      role: "CUSTOMER",
      termsAcceptedAt: new Date(),
      address: parsed.data.address ?? null,
      preferredPickupId,
    },
  });

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created. Please sign in to continue." };
    }
    throw error; // re-throw the NEXT_REDIRECT so navigation happens
  }

  return {};
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const typedEmail = String(formData.get("email") ?? "").trim();
  const values = { email: typedEmail };

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
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

  const identifier = parsed.data.email.trim();

  // Throttle password guessing, per account and per source address. Both keys
  // are checked so one attacker can't spread across accounts, and one account
  // can't be locked out cheaply from a single address.
  const ip = await clientIp();
  const accountKey = `login:id:${identifier.toLowerCase()}`;
  const ipKey = `login:ip:${ip}`;
  const perAccount = await rateLimit(accountKey, 8, 15 * 60 * 1000);
  const perIp = await rateLimit(ipKey, 30, 15 * 60 * 1000);
  if (!perAccount.ok || !perIp.ok) {
    const wait = Math.max(perAccount.retryAfter, perIp.retryAfter);
    return { error: `Too many sign-in attempts. Please try again in ${retryAfterLabel(wait)}.`, values };
  }

  const user = await findUserByIdentifier(identifier);
  const redirectTo = safeCallback(formData.get("callbackUrl")) ?? (await homeForUser(user));

  // An account with a second step gets its password checked here rather than
  // inside the provider, because what follows is a code rather than a session.
  // The same wrong-password wording either way: which accounts have a second
  // step is not something a sign-in form should disclose.
  if (user?.twoFactorEnabled && user.passwordHash) {
    if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return { error: "Invalid email or password.", values };
    }
    const channel = usableChannel(user, user.twoFactorChannel);
    const challenge = await issueChallenge(user, "SIGN_IN", channel);
    // The password was right, so the guessing counters have done their job.
    await clearRateLimit(accountKey);
    return { values, twoFactor: challenge };
  }

  try {
    await signIn("credentials", {
      email: identifier,
      password: parsed.data.password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password.", values };
    }
    // signIn throws NEXT_REDIRECT on success — the attempt worked, so clear the
    // counters before re-throwing so navigation still happens.
    await clearRateLimit(accountKey);
    await clearRateLimit(ipKey);
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
export async function verifyTwoFactorAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const challengeId = String(formData.get("challengeId") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const channel = String(formData.get("channel") ?? "email") as TwoFactorChannel;
  const hint = String(formData.get("hint") ?? "");
  const again: AuthFormState = { twoFactor: { challengeId, channel, hint } };

  if (!challengeId) return { error: EXPIRED };
  if (!/^\d{6}$/.test(code)) {
    return { ...again, error: "Enter the 6-digit code.", fieldErrors: { code: "6 digits." } };
  }

  const limit = await rateLimit(`login-2fa:ip:${await clientIp()}`, 20, 15 * 60 * 1000);
  if (!limit.ok) {
    return { error: `Too many attempts. Please try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  // Read-only, so the screen can say "expired" rather than "incorrect" without
  // spending one of the five attempts to find out.
  const state = await challengeState(challengeId, "SIGN_IN");
  if (state === "missing" || state === "expired") return { error: EXPIRED };
  if (state === "locked") {
    return { error: "Too many wrong codes. Enter your password again to start over." };
  }

  const redirectTo = safeCallback(formData.get("callbackUrl")) ?? "/account";
  try {
    await signIn("two-factor", { challengeId, code, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return { ...again, error: "Incorrect code.", fieldErrors: { code: "Incorrect." } };
    }
    throw error; // NEXT_REDIRECT — the code was right
  }

  return {};
}

export async function logoutAction() {
  // Release the account's session before the cookie goes, so the token that
  // was just signed out cannot be replayed from a copy of it.
  const session = await auth();
  const userId = session?.user?.id;
  if (userId) {
    await prisma.user
      .update({ where: { id: userId }, data: { activeSessionId: null } })
      .catch(() => undefined);
  }
  await signOut({ redirectTo: "/" });
}

/**
 * Sign out everywhere, from the account's own settings.
 *
 * The way back for somebody who signed in on a borrowed phone and walked away
 * from it: clearing the id makes every token out there stop working, including
 * the one doing the clearing.
 */
export async function signOutEverywhere(): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;
  await prisma.user
    .update({ where: { id: userId }, data: { activeSessionId: null } })
    .catch(() => undefined);
  await signOut({ redirectTo: "/login" });
}
