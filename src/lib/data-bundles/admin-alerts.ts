import "server-only";
import { prisma } from "@/lib/prisma";
import { notifyTemplate } from "@/lib/messages";

/**
 * Telling the admins that something is waiting for them.
 *
 * The console already shows what needs doing, but only to somebody who is
 * looking at it. A withdrawal request sitting unseen until tomorrow morning is
 * an agent wondering where their money is, so the things that need a person go
 * out on the same two channels everybody else is reached on.
 *
 * Best-effort, always: the thing being announced has already happened and been
 * saved, and failing to say so must never undo it.
 */
export async function notifyAdmins(
  key: string,
  vars: Record<string, string | number> = {},
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { phone: true, email: true },
    });
    await Promise.allSettled(admins.map((a) => notifyTemplate(a, key, vars)));
  } catch {
    // No admins readable, or the retail database is briefly away. Nothing to undo.
  }
}
