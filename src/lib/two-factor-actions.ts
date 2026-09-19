"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { challengeState, consumeChallenge, issueChallenge } from "@/lib/two-factor";
import { isChannel, usableChannel, type TwoFactorChannel } from "@/lib/two-factor-rules";

/**
 * Turning the second step on and off, from the account it belongs to.
 *
 * Switching it on is two steps rather than one: a code is sent to the channel
 * being chosen and has to come back before anything is saved. An address
 * somebody mistyped, or an inbox they no longer open, becomes a locked account
 * on the next sign-in — so the only way to enable it is to prove it works.
 *
 * Switching it off is immediate. Whoever is doing it is already signed in,
 * which is the same proof the second step exists to ask for.
 */

export type TwoFactorState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Set once a code is out and the form should ask for it. */
  pending?: { challengeId: string; channel: TwoFactorChannel; hint: string };
};

/** Send a code to the channel being set up. */
export async function startTwoFactorSetup(
  _prev: TwoFactorState,
  fd: FormData,
): Promise<TwoFactorState> {
  const session = await requireUser();
  const wanted = String(fd.get("channel") ?? "email");
  if (!isChannel(wanted)) return { error: "Choose where the code should be sent." };

  const user = await prisma.user
    .findUnique({
      where: { id: session.id },
      select: { id: true, name: true, email: true, phone: true },
    })
    .catch(() => null);
  if (!user) return { error: "Couldn't read your account. Please try again." };

  if (wanted === "sms" && !user.phone) {
    return { error: "Add a phone number to your account before using text messages." };
  }

  const limit = await rateLimit(`2fa-setup:${user.id}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return { error: `Too many codes requested. Please try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  const pending = await issueChallenge(user, "ENABLE", usableChannel(user, wanted));
  return { pending };
}

/** Check the code, and only then switch it on. */
export async function confirmTwoFactorSetup(
  _prev: TwoFactorState,
  fd: FormData,
): Promise<TwoFactorState> {
  const session = await requireUser();
  const challengeId = String(fd.get("challengeId") ?? "").trim();
  const channel = String(fd.get("channel") ?? "email");
  const hint = String(fd.get("hint") ?? "");
  if (!challengeId || !isChannel(channel)) return { error: "Start again." };

  const again: TwoFactorState = { pending: { challengeId, channel, hint } };
  const code = String(fd.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { ...again, error: "Enter the 6-digit code." };

  const state = await challengeState(challengeId, "ENABLE");
  if (state === "missing" || state === "expired") return { error: "That code has expired. Start again." };
  if (state === "locked") return { error: "Too many wrong codes. Start again." };

  const spent = await consumeChallenge(challengeId, code, "ENABLE");
  if (!spent.ok || spent.userId !== session.id) return { ...again, error: "Incorrect code." };

  await prisma.user.update({
    where: { id: session.id },
    data: { twoFactorEnabled: true, twoFactorChannel: channel },
  });
  revalidatePath("/account");
  return {
    ok: true,
    message: `Two-step verification is on. You'll be asked for a code at ${hint || "sign-in"}.`,
  };
}

/** Switch it off. Nothing to report back — the card re-renders as off. */
export async function disableTwoFactor(): Promise<void> {
  const session = await requireUser();
  await prisma.user.update({
    where: { id: session.id },
    data: { twoFactorEnabled: false },
  });
  await prisma.twoFactorChallenge
    .deleteMany({ where: { userId: session.id, consumedAt: null } })
    .catch(() => undefined);
  revalidatePath("/account");
}
