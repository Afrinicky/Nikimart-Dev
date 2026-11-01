"use server";
import { mirrorPasswordToRetail } from "@/lib/data-bundles/password-mirror";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { requireDataUser } from "@/lib/data-bundles/session";
import { retryAfterLabel } from "@/lib/rate-limit";
import { dataRateLimit } from "@/lib/data-bundles/rate-limit";

/**
 * Replacing a password somebody else chose for you.
 *
 * An agent registered by another agent is sent a working password with their
 * username. It has been through an SMS gateway and an inbox, and the person
 * who registered them knows it, so it is a way in exactly once: the console
 * refuses to show them anything until they have replaced it.
 *
 * Deliberately not a reset flow. They are already signed in — that is the only
 * way to reach this — so there is nothing to verify and no token to expire.
 * The one thing worth refusing is the password they were sent, because typing
 * it again is how somebody "changes" a password without changing anything.
 */

export type NewPasswordState = { ok?: boolean; error?: string; message?: string };

const schema = z
  .object({
    password: z.string().min(8, "Choose a password of at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  });

export async function setNewPassword(
  _prev: NewPasswordState,
  fd: FormData,
): Promise<NewPasswordState> {
  const user = await requireDataUser();

  const parsed = schema.safeParse({
    password: String(fd.get("password") ?? ""),
    confirmPassword: String(fd.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const limit = await dataRateLimit(`new-password:${user.id}`, 10, 15 * 60_000);
  if (!limit.ok) {
    return { error: `Too many attempts. Please try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  const account = await dataDb.dataUser
    .findUnique({ where: { id: user.id }, select: { passwordHash: true } })
    .catch(() => null);
  if (!account) return { error: "Couldn't find your account." };

  // Reusing the password they were sent leaves it exactly as exposed as it was.
  if (account.passwordHash && (await bcrypt.compare(parsed.data.password, account.passwordHash))) {
    return { error: "Choose a different password from the one you were sent." };
  }

  const newHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    await dataDb.dataUser.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        // The issued password this replaces went out by text and through an
        // inbox, and two people know it. Any session opened with it ends here,
        // including this one — they sign in again with the password they just
        // chose, which is the point.
        activeSessionId: null,
        activeSessionAt: null,
        // A new password lifts the sign-in lock as well. Somebody who can set
        // one has proved who they are at least as well as getting the old one
        // right would have, and leaving them locked out of an account they
        // have just secured would be absurd.
        failedLoginCount: 0,
        lockoutStage: 0,
        lockedUntil: null,
        lockedAt: null,
        // This account chose its own password. The stamp is what tells
        // scripts/copy-logins.mjs --refresh to leave this row alone rather
        // than overwrite it from the mall — still true now that the change is
        // mirrored the other way, because the mall is no longer the source.
        passwordChangedAt: new Date(),
      },
    });
  } catch {
    return { error: "Couldn't save your new password. Please try again." };
  }


  // And the mall, for somebody who holds both accounts. Changing a password
  // once should change their password, not half of it. Deliberately after the
  // bundle write and deliberately unable to fail it: the mall being away is
  // the situation this whole split exists for.
  await mirrorPasswordToRetail(user.id, user.email ?? "", newHash);

  revalidatePath("/agent");
  return { ok: true, message: "Password changed. You're all set." };
}
