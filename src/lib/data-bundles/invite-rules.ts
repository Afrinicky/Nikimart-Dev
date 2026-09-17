// Relative, with the extension: this module is pulled in by a *.test.ts run
// through Node's type stripping, which resolves neither the "@/…" alias nor a
// missing extension (the same reason lib/payment-routing does it this way).
import { clampPercent } from "./referral-rules.ts";

/**
 * When an admin-issued registration link may still be used.
 *
 * Pure, and tested, because every one of these conditions is a way to give a
 * discount away by accident: a link that outlives the campaign it was made for,
 * one shared publicly and used two hundred times, one switched off that keeps
 * working. The link is a price, so the rules that retire it are worth the same
 * care as the rules that set it.
 */

export interface InviteLike {
  waiverPercent: number;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
}

export type InviteProblem = "inactive" | "expired" | "used-up";

/** Why this link can't be used, or null when it can. */
export function inviteProblem(invite: InviteLike, now: Date = new Date()): InviteProblem | null {
  if (!invite.isActive) return "inactive";
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return "expired";
  // 0 means unlimited, which is the default: a link with no cap is the normal
  // case, and a cap of zero uses would be a link that never worked.
  if (invite.maxUses > 0 && invite.usedCount >= invite.maxUses) return "used-up";
  return null;
}

export function inviteUsable(invite: InviteLike, now: Date = new Date()): boolean {
  return inviteProblem(invite, now) === null;
}

/** What to tell somebody holding a link that no longer works. */
export function inviteProblemMessage(problem: InviteProblem): string {
  switch (problem) {
    case "expired":
      return "That registration link has expired. You can still register at the normal fee.";
    case "used-up":
      return "That registration link has already been used the maximum number of times. You can still register at the normal fee.";
    default:
      return "That registration link is no longer active. You can still register at the normal fee.";
  }
}

/** The discount a usable link grants; anything else grants nothing. */
export function inviteWaiverPercent(
  invite: InviteLike | null | undefined,
  now: Date = new Date(),
): number {
  if (!invite || !inviteUsable(invite, now)) return 0;
  return clampPercent(invite.waiverPercent);
}

/** How the discount reads on the signup form. */
export function inviteWaiverLabel(waiverPercent: number): string {
  const percent = clampPercent(waiverPercent);
  if (percent >= 100) return "Your registration fee is waived in full.";
  if (percent <= 0) return "";
  return `${percent % 1 === 0 ? percent : percent.toFixed(1)}% off your registration fee.`;
}

/**
 * Codes people read off a screen and type into a phone.
 *
 * No 0/O/1/I/L: the pairs that get transcribed wrong, on a code whose whole job
 * is to survive being written on a flyer and typed back in.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newInviteCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Normalise whatever arrives in the URL or a form field. */
export function normaliseInviteCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}
