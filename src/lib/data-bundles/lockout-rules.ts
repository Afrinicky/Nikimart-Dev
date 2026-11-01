/**
 * What happens to an account whose password keeps being got wrong.
 *
 * A fixed-window rate limit answers "how many attempts in the last ten
 * minutes", which is the right question for a flood and the wrong one for a
 * single account being guessed at patiently. This is the other half: an
 * escalation that remembers.
 *
 *   five wrong passwords  → a minute
 *   five more             → half an hour, and the administrators are told
 *   five after that       → held until a person lets it go
 *
 * The stage survives a lock expiring. That is the part that makes it an
 * escalation rather than a loop: somebody who waits out the minute and starts
 * again gets half an hour, not another minute. It resets only on a successful
 * sign-in, on an administrator lifting it, or on a password reset — each of
 * which is evidence that the person trying is the owner.
 *
 * "Five more" is `FAILURES_PER_STAGE`, deliberately the same at every stage.
 * One wrong password straight after a lock lifts is what a person with a typo
 * does as readily as somebody guessing, and jumping them to half an hour for
 * it would punish the wrong half far more often than the right one.
 *
 * Pure and clock-injected, so the escalation can be tested rather than
 * reasoned about. Nothing here reads a database or a date.
 */

export const FAILURES_PER_STAGE = 5;

/** 0 none · 1 served a minute · 2 served half an hour · 3 held for an admin. */
export type LockoutStage = 0 | 1 | 2 | 3;

export const STAGE_DURATION_MS: Record<LockoutStage, number | null> = {
  0: 0,
  1: 60 * 1000,
  2: 30 * 60 * 1000,
  // No duration: stage 3 ends when somebody decides it does.
  3: null,
};

export interface LockoutState {
  failedLoginCount: number;
  lockoutStage: number;
  lockedUntil: Date | null;
}

export interface LockStatus {
  locked: boolean;
  /** When it lifts, or null when only a person can lift it. */
  until: Date | null;
  /** True once it is stage 3 — no amount of waiting helps. */
  needsAdmin: boolean;
  stage: LockoutStage;
  /** Seconds left, 0 when not locked or when it needs an admin. */
  retryAfter: number;
}

function asStage(value: number): LockoutStage {
  if (value >= 3) return 3;
  if (value <= 0) return 0;
  return value as LockoutStage;
}

/** Whether this account may attempt a password at all right now. */
export function lockStatus(state: LockoutState, now: Date): LockStatus {
  const stage = asStage(state.lockoutStage);

  if (stage === 3) {
    return { locked: true, until: null, needsAdmin: true, stage, retryAfter: 0 };
  }

  const until = state.lockedUntil;
  if (until && until.getTime() > now.getTime()) {
    return {
      locked: true,
      until,
      needsAdmin: false,
      stage,
      retryAfter: Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000)),
    };
  }

  // The lock has lapsed. The stage stays where it is — that is the memory.
  return { locked: false, until: null, needsAdmin: false, stage, retryAfter: 0 };
}

export interface FailureOutcome {
  next: LockoutState;
  /** True when this failure is the one that locked the account. */
  justLocked: boolean;
  /** The stage it landed on, for the message and for who to tell. */
  stage: LockoutStage;
}

/** Record one wrong password and say what it cost. */
export function afterFailure(state: LockoutState, now: Date): FailureOutcome {
  const stage = asStage(state.lockoutStage);
  const count = Math.max(0, state.failedLoginCount) + 1;

  if (count < FAILURES_PER_STAGE) {
    return {
      next: { failedLoginCount: count, lockoutStage: stage, lockedUntil: state.lockedUntil },
      justLocked: false,
      stage,
    };
  }

  const nextStage = asStage(stage + 1);
  const duration = STAGE_DURATION_MS[nextStage];
  return {
    // The counter starts again, because the stage is now carrying the history.
    next: {
      failedLoginCount: 0,
      lockoutStage: nextStage,
      lockedUntil: duration === null ? null : new Date(now.getTime() + duration),
    },
    justLocked: true,
    stage: nextStage,
  };
}

/** A correct password clears everything. Getting in is the proof. */
export function afterSuccess(): LockoutState {
  return { failedLoginCount: 0, lockoutStage: 0, lockedUntil: null };
}

/** What an administrator lifting a lock, or a password reset, leaves behind. */
export const CLEARED: LockoutState = {
  failedLoginCount: 0,
  lockoutStage: 0,
  lockedUntil: null,
};

/** How to say a lock out loud, without saying whether the account exists. */
export function lockMessage(status: LockStatus): string {
  if (status.needsAdmin) {
    return (
      "This account is locked. Too many sign-in attempts have failed, so it now " +
      "needs an administrator to unlock it or set a new password. Please contact support."
    );
  }
  const seconds = status.retryAfter;
  const label =
    seconds < 60
      ? `${seconds} second${seconds === 1 ? "" : "s"}`
      : `${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) === 1 ? "" : "s"}`;
  return `Too many failed sign-in attempts. This account is locked for ${label}.`;
}
