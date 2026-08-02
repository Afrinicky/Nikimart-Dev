"use server";

import { createHash, randomInt } from "crypto";
import { after } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notify, emailShell } from "@/lib/notifications";
import { findUserByIdentifier } from "@/lib/user-lookup";

export type ResetState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

const OTP_TTL_MS = 1000 * 60 * 10; // 10 minutes
const MAX_ATTEMPTS = 5;

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Request a password-reset OTP by email or phone. Always reports success (never
 * reveals whether an account exists). A 6-digit code is sent by SMS + email.
 */
export async function requestResetOtp(_prev: ResetState, fd: FormData): Promise<ResetState> {
  const identifier = String(fd.get("identifier") ?? "").trim();
  if (identifier.length < 3) {
    return { error: "Enter your email or phone number.", fieldErrors: { identifier: "Required." } };
  }

  const user = await findUserByIdentifier(identifier);
  if (user) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashOtp(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    const recipient = user;
    after(async () => {
      const result = await notify(recipient, {
        sms: `Your NikiMart password reset code is ${code}. It expires in 10 minutes. Never share it.`,
        emailSubject: "Your NikiMart reset code",
        emailHtml: emailShell(
          `Use this code to reset your password (valid 10 minutes):<br/><br/><div style="font-size:28px;font-weight:700;letter-spacing:6px;color:#0e1f36">${code}</div><br/>If you didn't request this, you can ignore this email.`,
          "Password reset code",
        ),
      });
      // One line per request so delivery is diagnosable in the server logs
      // (the code itself is never logged). Both false ⇒ check provider config.
      console.info(
        `[reset-otp] user ${user.id} — sms=${result.sms ?? "n/a"} email=${result.email ?? "n/a"}` +
          (result.sms === false || result.email === false
            ? " (a false channel means the provider rejected it — see the [sms]/[email] error above)"
            : ""),
      );
    });
  }

  return { ok: true };
}

const resetSchema = z
  .object({
    identifier: z.string().trim().min(3),
    otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords don't match.", path: ["confirm"] });

/** Verify the OTP and set a new password. */
export async function resetWithOtp(_prev: ResetState, fd: FormData): Promise<ResetState> {
  const parsed = resetSchema.safeParse({
    identifier: fd.get("identifier"),
    otp: fd.get("otp"),
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

  const user = await findUserByIdentifier(parsed.data.identifier);
  const invalid = { error: "That code is invalid or has expired. Request a new one." };
  if (!user) return invalid;

  const token = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!token || token.expiresAt < new Date()) return invalid;

  if (token.attempts >= MAX_ATTEMPTS) {
    await prisma.passwordResetToken.delete({ where: { id: token.id } }).catch(() => {});
    return { error: "Too many attempts. Please request a new code." };
  }

  if (hashOtp(parsed.data.otp) !== token.tokenHash) {
    await prisma.passwordResetToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    return { error: "Incorrect code. Please try again.", fieldErrors: { otp: "Incorrect." } };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
  ]);
  return { ok: true };
}
