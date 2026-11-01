"use server";
import { mirrorPasswordToRetail } from "@/lib/data-bundles/password-mirror";

import { createHash, randomInt } from "crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { notifyTemplate } from "@/lib/messages";
import { findDataUserByIdentifier } from "@/lib/data-bundles/user-lookup";
import { dataRateLimit } from "@/lib/data-bundles/rate-limit";
import { retryAfterLabel } from "@/lib/rate-limit";
import { CLEARED } from "@/lib/data-bundles/lockout-rules";

/**
 * Getting back in, for a bundle account.
 *
 * The mall's twin, against this database. Until this existed an agent who
 * forgot their password could not recover it at all: the mall's reset writes
 * the mall's `User` table, which this side stopped reading when the logins
 * moved, so forgetting meant waiting for an administrator. That is a support
 * ticket for something the person can prove for themselves — and it is also
 * the way out of a stage-3 sign-in lock, so the two people most in need of it
 * were someone who had forgotten their password and someone locked out trying
 * to remember it.
 *
 * Three things this has to get right, all of them the same shape:
 *
 *   • It never says whether an account exists. The response to an unknown
 *     identifier is the response to a known one, down to the wording.
 *   • Requesting a code is throttled, not just guessing one. A fresh code
 *     clears the attempt counter, so without that cap somebody could ask for a
 *     new one between every five guesses and have the six digits eventually.
 *   • Succeeding ends every session the account holds and lifts any sign-in
 *     lock. Whoever had the old password is signed out by it, which is the
 *     entire point of a reset, and whoever was locked out is the person who
 *     just proved they own the address.
 */

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export type DataResetState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const OTP_TTL_MS = 1000 * 60 * 10; // 10 minutes
const MAX_ATTEMPTS = 5;

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Ask for a code. Always reports success, whoever was typed. */
export async function requestDataResetOtp(
  _prev: DataResetState,
  fd: FormData,
): Promise<DataResetState> {
  const identifier = String(fd.get("identifier") ?? "").trim();
  if (identifier.length < 3) {
    return { error: "Enter your email or phone number.", fieldErrors: { identifier: "Required." } };
  }

  const ip = await clientIp();
  const [perIdentifier, perIp] = await Promise.all([
    dataRateLimit(`data-reset:id:${identifier.toLowerCase()}`, 3, 15 * 60 * 1000),
    dataRateLimit(`data-reset:ip:${ip}`, 10, 15 * 60 * 1000),
  ]);
  if (!perIdentifier.ok || !perIp.ok) {
    const wait = Math.max(perIdentifier.retryAfter, perIp.retryAfter);
    return { error: `Too many reset requests. Please try again in ${retryAfterLabel(wait)}.` };
  }

  const user = await findDataUserByIdentifier(identifier).catch(() => null);
  if (user) {
    // One live code at a time: two would double the guessing surface for no
    // gain, and the older one is the one somebody else might have seen.
    await dataDb.dataPasswordResetToken
      .deleteMany({ where: { userId: user.id, usedAt: null } })
      .catch(() => undefined);

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const written = await dataDb.dataPasswordResetToken
      .create({
        data: {
          userId: user.id,
          tokenHash: hashOtp(code),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      })
      .catch(() => null);

    if (written) {
      const to = { phone: user.phone, email: user.email };
      after(async () => {
        await notifyTemplate(to, "agent.resetCode", {
          code,
          minutes: Math.round(OTP_TTL_MS / 60000),
        });
      });
    }
  }

  // The same answer either way. Somebody probing which numbers belong to
  // agents learns nothing here that they did not already type in.
  return { ok: true };
}

const resetSchema = z
  .object({
    identifier: z.string().trim().min(3, "Enter your email or phone number."),
    otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
    password: z.string().min(8, "Choose a password of at least 8 characters."),
    // Named `confirm` because that is what the shared form calls it. Sharing
    // the component means sharing its field names, and a mismatch here fails
    // as "please fix the highlighted fields" with nothing highlighted.
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Both passwords must match.",
    path: ["confirm"],
  });

/** Spend the code and set the new password. */
export async function resetDataPasswordWithOtp(
  _prev: DataResetState,
  fd: FormData,
): Promise<DataResetState> {
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

  // Capped per source as well as per token: the per-token counter alone can be
  // sidestepped by requesting new codes, and this is the other half of that.
  const verifyLimit = await dataRateLimit(`data-reset-verify:ip:${await clientIp()}`, 20, 15 * 60 * 1000);
  if (!verifyLimit.ok) {
    return { error: `Too many attempts. Please try again in ${retryAfterLabel(verifyLimit.retryAfter)}.` };
  }

  const invalid = { error: "That code is invalid or has expired. Request a new one." };
  const user = await findDataUserByIdentifier(parsed.data.identifier).catch(() => null);
  if (!user) return invalid;

  const token = await dataDb.dataPasswordResetToken
    .findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: "desc" } })
    .catch(() => null);
  if (!token || token.expiresAt < new Date()) return invalid;

  if (token.attempts >= MAX_ATTEMPTS) {
    await dataDb.dataPasswordResetToken.delete({ where: { id: token.id } }).catch(() => undefined);
    return { error: "Too many attempts. Please request a new code." };
  }

  if (hashOtp(parsed.data.otp) !== token.tokenHash) {
    await dataDb.dataPasswordResetToken
      .update({ where: { id: token.id }, data: { attempts: { increment: 1 } } })
      .catch(() => undefined);
    return { error: "Incorrect code. Please try again.", fieldErrors: { otp: "Incorrect." } };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await dataDb.$transaction([
    dataDb.dataUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        // This account has its own password now, so a re-run of
        // copy-logins.mjs --refresh must not put the mall's back.
        passwordChangedAt: new Date(),
        // A password that was issued by text is replaced by this one too.
        mustChangePassword: false,
        // Every session the account holds ends here. Somebody resetting a
        // password because another person has it needs that to be true.
        activeSessionId: null,
        activeSessionAt: null,
        // And the sign-in lock lifts: proving you can read the address is at
        // least as good as remembering the password would have been.
        ...CLEARED,
        lockedAt: null,
      },
    }),
    dataDb.dataPasswordResetToken.deleteMany({ where: { userId: user.id } }),
  ]);

  // And the mall, for somebody who holds both accounts. Somebody recovering
  // an account they have been locked out of should come back to one password,
  // not two. Best-effort, after the fact: the reset has already succeeded.
  await mirrorPasswordToRetail(user.id, user.email, passwordHash);

  return { ok: true };
}

/** Drop spent and expired reset tokens. For the nightly sweep. */
export async function sweepDataResetTokens(): Promise<number> {
  try {
    const { count } = await dataDb.dataPasswordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] },
    });
    return count;
  } catch {
    return 0;
  }
}
