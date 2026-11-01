import "server-only";
import { after } from "next/server";
import { dataDb } from "@/lib/data-db";
import { notifyAdmins } from "@/lib/data-bundles/admin-alerts";
import {
  CLEARED,
  afterFailure,
  afterSuccess,
  lockStatus,
  type LockStatus,
  type LockoutState,
} from "@/lib/data-bundles/lockout-rules";

/**
 * The escalating lock, against the database.
 *
 * The rules live next door in lockout-rules.ts, pure and tested; this is only
 * the part that reads and writes them, plus telling the administrators when an
 * account reaches half an hour.
 *
 * Where this is enforced matters more than it looks. The check and the record
 * both happen inside the credentials provider's `authorize`, not in the
 * sign-in action: the action is one way to reach the password check and the
 * Auth.js callback endpoint is another, and a lock that only the form
 * respected would be no lock at all. The action reads the state afterwards
 * purely to say something useful on the screen.
 *
 * Everything here fails open on a database error, deliberately and in one
 * direction only: an unreadable lock state must not refuse somebody who has
 * typed the right password, because that would turn a blip into a lockout for
 * everybody at once. The password itself is still checked either way.
 */

const SELECT = {
  failedLoginCount: true,
  lockoutStage: true,
  lockedUntil: true,
} as const;

/** The lock state of one account, or null when it cannot be read. */
export async function readLockout(userId: string): Promise<LockoutState | null> {
  try {
    return await dataDb.dataUser.findUnique({ where: { id: userId }, select: SELECT });
  } catch {
    return null;
  }
}

/** Is this account locked right now? Unreadable state reads as "not locked". */
export async function currentLock(userId: string): Promise<LockStatus | null> {
  const state = await readLockout(userId);
  if (!state) return null;
  const status = lockStatus(state, new Date());
  return status.locked ? status : null;
}

/**
 * Record one wrong password.
 *
 * Returns the lock it caused, or null when the account is still under the
 * threshold. The administrators are told after the response rather than
 * before it: the lock is already written, and an SMS gateway having a slow
 * minute must not hold up telling somebody their password was wrong.
 */
export async function recordFailure(user: {
  id: string;
  email: string;
  name: string | null;
}): Promise<LockStatus | null> {
  const state = await readLockout(user.id);
  if (!state) return null;

  const now = new Date();
  const outcome = afterFailure(state, now);

  try {
    await dataDb.dataUser.update({
      where: { id: user.id },
      data: {
        failedLoginCount: outcome.next.failedLoginCount,
        lockoutStage: outcome.next.lockoutStage,
        lockedUntil: outcome.next.lockedUntil,
        lastFailedLoginAt: now,
        ...(outcome.justLocked ? { lockedAt: now } : {}),
      },
    });
  } catch {
    return null;
  }

  if (outcome.justLocked && outcome.stage >= 2) {
    const held = outcome.stage === 3;
    after(async () => {
      await notifyAdmins(held ? "agentAccountHeld" : "agentAccountLocked", {
        name: user.name ?? user.email,
        email: user.email,
      });
    });
  }

  return outcome.justLocked ? lockStatus(outcome.next, now) : null;
}

/** A correct password clears the history. */
export async function clearAfterSuccess(userId: string): Promise<void> {
  const next = afterSuccess();
  await dataDb.dataUser
    .update({
      where: { id: userId },
      data: { ...next, lockedAt: null },
    })
    .catch(() => undefined);
}

/**
 * An administrator letting an account go, or a password being reset.
 *
 * Separate from `clearAfterSuccess` only so the call sites read as what they
 * are; the state they leave is the same, because "this is the owner" is the
 * same conclusion however it was reached.
 */
export async function liftLock(userId: string): Promise<void> {
  await dataDb.dataUser
    .update({ where: { id: userId }, data: { ...CLEARED, lockedAt: null } })
    .catch(() => undefined);
}
