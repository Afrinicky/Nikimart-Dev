import "server-only";
import { createHash, randomInt } from "crypto";
import { after } from "next/server";
import { dataDb } from "@/lib/data-db";
import { notifyTemplate } from "@/lib/messages";
import {
  channelHint,
  type ChallengeRecipient,
  type TwoFactorChannel,
  type TwoFactorPurpose,
} from "@/lib/two-factor-rules";

/**
 * The code that comes after the password, for the bundle business.
 *
 * The mall's twin, against this database. The rules for which channel a code
 * may go to are shared — `two-factor-rules.ts` is pure and reads nothing — but
 * the challenges are written here, because an agent signing in must not need
 * the mall to be reachable and a challenge table over there would have put
 * that straight back.
 *
 * The flags came across with the logins in 0023 and were being ignored: an
 * account with `twoFactorEnabled` set was signed in on the password alone,
 * which is worse than not offering a second step at all, because the account's
 * own settings said otherwise. This is what honours them.
 *
 * Sent rather than generated on the device, matching the mall and for the same
 * reason: the SMS and email machinery is already here, and an authenticator
 * app is a large thing to ask of somebody selling bundles from a market stall.
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
export async function issueDataChallenge(
  user: ChallengeRecipient,
  purpose: TwoFactorPurpose,
  channel: TwoFactorChannel,
): Promise<IssuedChallenge> {
  await dataDb.dataTwoFactorChallenge
    .deleteMany({ where: { userId: user.id, purpose, consumedAt: null } })
    .catch(() => undefined);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const challenge = await dataDb.dataTwoFactorChallenge.create({
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
    await notifyTemplate(to, "agent.signInCode", {
      code,
      minutes: Math.round(TWO_FACTOR_TTL_MS / 60000),
    });
  });

  return { challengeId: challenge.id, channel, hint: channelHint(user, channel) };
}

export type ChallengeState = "ok" | "missing" | "expired" | "locked" | "unavailable";

/**
 * What state a challenge is in, without spending an attempt on finding out.
 *
 * Read-only so the screen can say "that code has expired" rather than
 * "incorrect", which is the difference between somebody requesting a new code
 * and somebody retyping the old one five times.
 *
 * A database that cannot be read returns "unavailable" rather than "missing".
 * The mall's version collapses the two, and tells somebody holding a perfectly
 * good code that it has expired; this one can say what is actually wrong.
 */
export async function dataChallengeState(
  challengeId: string,
  purpose: TwoFactorPurpose,
): Promise<ChallengeState> {
  let row;
  try {
    row = await dataDb.dataTwoFactorChallenge.findUnique({
      where: { id: challengeId },
      select: { purpose: true, expiresAt: true, attempts: true, consumedAt: true },
    });
  } catch {
    return "unavailable";
  }
  if (!row || row.purpose !== purpose || row.consumedAt) return "missing";
  if (row.expiresAt < new Date()) return "expired";
  if (row.attempts >= MAX_ATTEMPTS) return "locked";
  return "ok";
}

export interface ConsumedChallenge {
  ok: boolean;
  userId?: string;
  /** True when the database could not be reached, so "wrong" is not the answer. */
  unavailable?: boolean;
}

/** Spend a code. Proof of both halves, since a challenge only exists after a password. */
export async function consumeDataChallenge(
  challengeId: string,
  code: string,
  purpose: TwoFactorPurpose,
): Promise<ConsumedChallenge> {
  let row;
  try {
    row = await dataDb.dataTwoFactorChallenge.findUnique({
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
    });
  } catch {
    // Not a wrong code — a database that did not answer. Said apart so the
    // screen does not spend one of the five attempts calling it incorrect.
    return { ok: false, unavailable: true };
  }

  if (!row || row.purpose !== purpose || row.consumedAt) return { ok: false };
  if (row.expiresAt < new Date() || row.attempts >= MAX_ATTEMPTS) return { ok: false };

  if (hashCode(code) !== row.codeHash) {
    await dataDb.dataTwoFactorChallenge
      .update({ where: { id: row.id }, data: { attempts: { increment: 1 } } })
      .catch(() => undefined);
    return { ok: false };
  }

  // Conditional on still being unconsumed: the winner of a race is the only
  // one that gets a user back.
  const claimed = await dataDb.dataTwoFactorChallenge
    .updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } })
    .catch(() => ({ count: 0 }));
  if (claimed.count === 0) return { ok: false };

  return { ok: true, userId: row.userId };
}

/** Drop spent and expired challenges. For the cron, so the table stays small. */
export async function sweepDataChallenges(): Promise<number> {
  try {
    const { count } = await dataDb.dataTwoFactorChallenge.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { not: null } }] },
    });
    return count;
  } catch {
    return 0;
  }
}
