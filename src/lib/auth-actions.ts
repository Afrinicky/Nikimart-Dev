"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { termsAccepted, TERMS_REQUIRED_MESSAGE } from "@/lib/terms";
import { prisma } from "@/lib/prisma";
import { isRole, ROLE_HOME } from "@/lib/roles";
import { findUserByIdentifier } from "@/lib/user-lookup";
import { clearRateLimit, rateLimit, retryAfterLabel } from "@/lib/rate-limit";

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
  const redirectTo = safeCallback(formData.get("callbackUrl")) ?? homeForRole(user?.role);

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

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
