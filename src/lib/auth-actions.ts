"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRole, ROLE_HOME } from "@/lib/roles";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
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
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

function homeForRole(role: string | undefined) {
  return role && isRole(role) ? ROLE_HOME[role] : "/account";
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    address: formData.get("address"),
    preferredPickupId: formData.get("preferredPickupId"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      error: "An account with that email already exists.",
      fieldErrors: { email: "Email already registered." },
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

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      phone: parsed.data.phone ?? null,
      passwordHash,
      role: "CUSTOMER",
      address: parsed.data.address ?? null,
      preferredPickupId,
    },
  });

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: "/account",
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
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  });
  const redirectTo = homeForRole(user?.role);

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error; // re-throw the NEXT_REDIRECT so navigation happens
  }

  return {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
