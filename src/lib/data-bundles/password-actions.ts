"use server";

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

  try {
    await dataDb.dataUser.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
        mustChangePassword: false,
        // This account has its own password now, and the mall has never heard
        // of it. The stamp is what tells scripts/copy-logins.mjs --refresh to
        // leave this row alone rather than overwrite it with the copied one.
        passwordChangedAt: new Date(),
      },
    });
  } catch {
    return { error: "Couldn't save your new password. Please try again." };
  }

  revalidatePath("/agent");
  return { ok: true, message: "Password changed. You're all set." };
}
