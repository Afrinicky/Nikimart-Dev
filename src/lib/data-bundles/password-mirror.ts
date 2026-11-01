import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Keeping a mall password in step with a bundle one.
 *
 * The split gave the two businesses separate accounts on purpose, and the
 * first rule written down was that they may drift: a password changed in the
 * agent console was the agent console's business and the mall never heard of
 * it. That rule has been overruled deliberately — somebody who holds both and
 * changes their password once expects to have changed their password, not one
 * half of it.
 *
 * So this mirrors, in one direction only: bundle → mall. A password changed on
 * the mall side still does not reach here, because the mall knows nothing
 * about this database and reaching across from there would hand retail a
 * dependency on the business that was just freed of it.
 *
 * It is best-effort and must stay that way. The bundle password has already
 * been written by the time this runs; if the mall is unreachable — which is
 * the exact situation the split exists for — the agent's own password change
 * must still stand. A failure here is logged and nothing else.
 *
 * Which mall account
 * ------------------
 * By id first. Accounts copied in 0023 kept their cuid, so for everybody who
 * existed before the split the two rows share an id and the match is exact.
 *
 * Only if that finds nothing does it fall back to the email address, which is
 * how an agent approved *after* the split is matched: they were minted a fresh
 * cuid here and may have registered on the mall separately. The fallback is
 * deliberately an exact, unique email match and nothing looser — a phone
 * number would be tempting and is not unique in the mall's table, and setting
 * a stranger's password because two people share a number is not a trade worth
 * making.
 */
export async function mirrorPasswordToRetail(
  userId: string,
  email: string,
  passwordHash: string,
): Promise<"mirrored" | "no-account" | "unavailable"> {
  try {
    const byId = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    const target =
      byId ??
      (await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true },
      }));

    if (!target) return "no-account";

    await prisma.user.update({
      where: { id: target.id },
      data: {
        passwordHash,
        // The mall's sessions end too. Changing a password is meant to lock
        // out whoever had the old one, and leaving a live mall session behind
        // would only half do it.
        activeSessionId: null,
        activeSessionAt: null,
      },
    });
    return "mirrored";
  } catch (error) {
    // The mall being away is the normal case this whole branch was built for.
    console.error("[data-auth] could not mirror the password to retail:", error);
    return "unavailable";
  }
}
