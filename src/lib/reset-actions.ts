"use server";

import { randomBytes, createHash } from "crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notify, emailShell } from "@/lib/notifications";
import { findUserByIdentifier } from "@/lib/user-lookup";

export type ResetState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

const TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Request a password reset. Always reports success (never reveals whether an
 * email is registered). When the account exists, a single-use token is created
 * and its link delivered by email + SMS.
 */
export async function requestPasswordReset(_prev: ResetState, fd: FormData): Promise<ResetState> {
  const identifier = String(fd.get("email") ?? "").trim();
  if (identifier.length < 3) {
    return { error: "Enter your email or phone number.", fieldErrors: { email: "Required." } };
  }

  const user = await findUserByIdentifier(identifier);

  if (user) {
    // Invalidate previous unused tokens, then issue a fresh one.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    const raw = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    });
    const link = `${await origin()}/reset-password?token=${raw}`;
    await notify(user, {
      sms: `NikiMart password reset: open ${link} to set a new password (valid 1 hour). Ignore if this wasn't you.`,
      emailSubject: "Reset your NikiMart password",
      emailHtml: emailShell(
        `We received a request to reset your password. Click below to choose a new one (valid for 1 hour):<br/><br/><a href="${link}" style="background:#ff7a1a;color:#fff;padding:10px 18px;border-radius:9999px;text-decoration:none;font-weight:700">Reset password</a><br/><br/>If you didn't request this, you can safely ignore this email.`,
        "Password reset",
      ),
    });
  }

  // Same response whether or not the account exists.
  return { ok: true };
}

const resetSchema = z
  .object({
    token: z.string().min(10),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords don't match.", path: ["confirm"] });

/** Complete a password reset with a valid token. */
export async function resetPassword(_prev: ResetState, fd: FormData): Promise<ResetState> {
  const parsed = resetSchema.safeParse({
    token: fd.get("token"),
    password: fd.get("password"),
    confirm: fd.get("confirm"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: "This reset link is invalid or has expired. Please request a new one." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Any other outstanding tokens for this user are now void.
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } }),
  ]);

  return { ok: true };
}
