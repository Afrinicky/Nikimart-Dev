import "server-only";
import { createHash, randomInt } from "crypto";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { emailShell, notify } from "@/lib/notifications";
import {
  channelHint,
  type ChallengeRecipient,
  type TwoFactorChannel,
  type TwoFactorPurpose,
} from "@/lib/two-factor-rules";

/**
 * The code that comes after the password.
 *
 * Optional, because the people on this platform sign in from one phone with
 * one SIM: a second step nobody chose is a lockout, not a safeguard. Whoever
 * wants one turns it on, proves they can receive a code before it takes
 * effect, and an admin can switch it off for somebody who has lost the phone.
 *
 * Sent rather than generated on the device, because the SMS and email
 * machinery is already here and an authenticator app is a large thing to ask
 * of an agent selling bundles from a market stall.
 */

export const TWO_FACTOR_TTL_MS = 10 * 60 * 1000;
/** Six digits are a million guesses without this. */
export const MAX_ATTEMPTS = 5;

/** The code is stored as a digest, never as itself. */
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export interface IssuedChallenge {
  challengeId: string;
  channel: TwoFactorChannel;
  hint: string;
}

/**
 * Send a fresh code and record what it should be.
 *
 * Any earlier challenge of the same purpose is dropped first, so only the most
 * recent code works — two live codes double the guessing surface for no gain.
 * The send happens after the response: nobody should wait on an SMS gateway to
 * be shown the box they type the code into.
 */
export async function issueChallenge(
  user: ChallengeRecipient,
  purpose: TwoFactorPurpose,
  channel: TwoFactorChannel,
): Promise<IssuedChallenge> {
  await prisma.twoFactorChallenge
    .deleteMany({ where: { userId: user.id, purpose, consumedAt: null } })
    .catch(() => undefined);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const challenge = await prisma.twoFactorChallenge.create({
    data: {
      userId: user.id,
      purpose,
      channel,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MS),
    },
    select: { id: true },
  });

  const to = channel === "sms" ? { phone: user.phone } : { email: user.email };
  after(async () => {
    await notify(to, {
      sms: `Your Nickimart sign-in code is ${code}. It expires in 10 minutes. Never share it.`,
      emailSubject: "Your Nickimart sign-in code",
      emailHtml: emailShell(
        `Use this code to finish signing in (valid 10 minutes):<br/><br/>` +
          `<div style="font-size:28px;font-weight:700;letter-spacing:6px;color:#1f1f1f">${code}</div>` +
          `<br/>If this wasn't you, change your password.`,
        "Sign-in code",
      ),
    });
  });

  return { challengeId: challenge.id, channel, hint: channelHint(user, channel) };
}

export type ChallengeState = "ok" | "missing" | "expired" | "locked";

/**
 * Whether a challenge is still worth typing into, without touching it.
 *
 * Read-only on purpose: it lets the screen say "that code expired" rather than
 * "incorrect" without spending one of the five attempts to find out.
 */
export async function challengeState(
  challengeId: string,
  purpose: TwoFactorPurpose,
): Promise<ChallengeState> {
  const row = await prisma.twoFactorChallenge
    .findUnique({
      where: { id: challengeId },
      select: { purpose: true, expiresAt: true, attempts: true, consumedAt: true },
    })
    .catch(() => null);
  if (!row || row.purpose !== purpose || row.consumedAt) return "missing";
  if (row.expiresAt < new Date()) return "expired";
  if (row.attempts >= MAX_ATTEMPTS) return "locked";
  return "ok";
}

export interface ConsumedChallenge {
  ok: boolean;
  userId?: string;
}

/**
 * Spend a challenge against a typed code.
 *
 * The claim is marked consumed in the same conditional update that checks it,
 * so two requests arriving together cannot both succeed on one code. A wrong
 * code costs an attempt; five wrong codes end the challenge.
 */
export async function consumeChallenge(
  challengeId: string,
  code: string,
  purpose: TwoFactorPurpose,
): Promise<ConsumedChallenge> {
  const row = await prisma.twoFactorChallenge
    .findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        userId: true,
        purpose: true,
        codeHash: true,
        expiresAt: true,
        attempts: true,
        consumedAt: true,
      },
    })
    .catch(() => null);

  if (!row || row.purpose !== purpose || row.consumedAt) return { ok: false };
  if (row.expiresAt < new Date() || row.attempts >= MAX_ATTEMPTS) return { ok: false };

  if (hashCode(code) !== row.codeHash) {
    await prisma.twoFactorChallenge
      .update({ where: { id: row.id }, data: { attempts: { increment: 1 } } })
      .catch(() => undefined);
    return { ok: false };
  }

  // Conditional on still being unconsumed: the winner of a race is the only
  // one that gets a user back.
  const claimed = await prisma.twoFactorChallenge
    .updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } })
    .catch(() => ({ count: 0 }));
  if (claimed.count === 0) return { ok: false };

  return { ok: true, userId: row.userId };
}
