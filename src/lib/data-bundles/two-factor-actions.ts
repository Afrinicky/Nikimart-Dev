"use server";

import { revalidatePath } from "next/cache";
import { dataDb } from "@/lib/data-db";
import { requireDataUser } from "@/lib/data-bundles/session";
import { dataRateLimit } from "@/lib/data-bundles/rate-limit";
import { retryAfterLabel } from "@/lib/rate-limit";
import {
  consumeDataChallenge,
  dataChallengeState,
  issueDataChallenge,
} from "@/lib/data-bundles/two-factor";
import { isChannel, usableChannel, type TwoFactorChannel } from "@/lib/two-factor-rules";

/**
 * Turning the second step on and off, for a bundle account.
 *
 * The mall's twin, against this database. It has to be a twin rather than a
 * shared module because the mall's version writes `User.twoFactorEnabled` and
 * the bundle sign-in reads `DataUser.twoFactorEnabled` — the agent settings
 * card was wired to the mall's actions, so turning the switch on appeared to
 * work and changed nothing here. Worse than appearing not to work: the agent
 * believed they had a second step and did not.
 *
 * A code is sent and checked *before* it is switched on, deliberately. Somebody
 * who turns this on and then finds the codes go to an inbox they cannot open
 * has locked themselves out of their own console, and the only way to know in
 * advance is to make them prove the channel works first.
 */

export type DataTwoFactorState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Set once a code is out and the form should ask for it. */
  pending?: { challengeId: string; channel: TwoFactorChannel; hint: string };
};

function revalidateSecurity() {
  revalidatePath("/agent/settings");
}

/** Send a code to the channel being set up. */
export async function startDataTwoFactorSetup(
  _prev: DataTwoFactorState,
  fd: FormData,
): Promise<DataTwoFactorState> {
  const session = await requireDataUser();
  const wanted = String(fd.get("channel") ?? "email");
  if (!isChannel(wanted)) return { error: "Choose where the code should be sent." };

  const user = await dataDb.dataUser
    .findUnique({
      where: { id: session.id },
      select: { id: true, name: true, email: true, phone: true },
    })
    .catch(() => null);
  if (!user) return { error: "Couldn't read your account. Please try again." };

  if (wanted === "sms" && !user.phone) {
    return { error: "Add a phone number to your account before using text messages." };
  }

  const limit = await dataRateLimit(`data-2fa-setup:${user.id}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return { error: `Too many codes requested. Please try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  try {
    const pending = await issueDataChallenge(user, "ENABLE", usableChannel(user, wanted));
    return { pending };
  } catch {
    return { error: "Couldn't send the code just now. Please try again in a moment." };
  }
}

/** Check the code, and only then switch it on. */
export async function confirmDataTwoFactorSetup(
  _prev: DataTwoFactorState,
  fd: FormData,
): Promise<DataTwoFactorState> {
  const session = await requireDataUser();
  const challengeId = String(fd.get("challengeId") ?? "").trim();
  const channel = String(fd.get("channel") ?? "email");
  const hint = String(fd.get("hint") ?? "");
  if (!challengeId || !isChannel(channel)) return { error: "Start again." };

  const again: DataTwoFactorState = { pending: { challengeId, channel, hint } };
  const code = String(fd.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { ...again, error: "Enter the 6-digit code." };

  const state = await dataChallengeState(challengeId, "ENABLE");
  if (state === "unavailable") {
    return { ...again, error: "Couldn't check that code just now. Please try again in a moment." };
  }
  if (state === "missing" || state === "expired") return { error: "That code has expired. Start again." };
  if (state === "locked") return { error: "Too many wrong codes. Start again." };

  const spent = await consumeDataChallenge(challengeId, code, "ENABLE");
  // The challenge must belong to the person turning it on: a code spent for
  // one account must never switch it on for another.
  if (!spent.ok || spent.userId !== session.id) return { ...again, error: "Incorrect code." };

  await dataDb.dataUser.update({
    where: { id: session.id },
    data: { twoFactorEnabled: true, twoFactorChannel: channel },
  });
  revalidateSecurity();
  return {
    ok: true,
    message: `Two-step verification is on. You'll be asked for a code at ${hint || "sign-in"}.`,
  };
}

/** Switch it off. Nothing to report back — the card re-renders as off. */
export async function disableDataTwoFactor(): Promise<void> {
  const session = await requireDataUser();
  await dataDb.dataUser.update({
    where: { id: session.id },
    data: { twoFactorEnabled: false },
  });
  await dataDb.dataTwoFactorChallenge
    .deleteMany({ where: { userId: session.id, consumedAt: null } })
    .catch(() => undefined);
  revalidateSecurity();
}
