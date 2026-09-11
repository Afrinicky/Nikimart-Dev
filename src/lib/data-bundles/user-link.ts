import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Joining an agent to the person behind it, across two databases.
 *
 * `DataAgent.userId` points at a `User.id` in the retail database, which
 * Postgres cannot follow — so what used to be `include: { user: … }` is two
 * queries instead of one. Everything here does that second hop, and does it
 * once for a whole page of rows rather than once per row: a roster of fifty
 * agents costs one extra query, not fifty.
 *
 * A user that has gone missing (deleted on the retail side) resolves to null
 * rather than throwing. An agent whose person no longer exists is a support
 * problem, not a reason for the console to stop rendering.
 */

/** The fields any screen needs about the person behind an agent. */
export interface AgentUser {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  /**
   * Whether they have ever been able to sign in. The hash itself is read here
   * and reduced to a boolean immediately — it never leaves this module.
   */
  canSignIn: boolean;
}

/** Look up several users at once, keyed by id. Missing ids are simply absent. */
export async function getAgentUsers(userIds: string[]): Promise<Map<string, AgentUser>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  try {
    const rows = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, phone: true, passwordHash: true },
    });
    return new Map(
      rows.map((u) => [
        u.id,
        { id: u.id, name: u.name, email: u.email, phone: u.phone, canSignIn: Boolean(u.passwordHash) },
      ]),
    );
  } catch {
    return new Map();
  }
}

/** The person behind one agent, or null. */
export async function getAgentUser(userId: string | null | undefined): Promise<AgentUser | null> {
  if (!userId) return null;
  return (await getAgentUsers([userId])).get(userId) ?? null;
}

/**
 * Attach `user` to a list of agent-shaped rows, the way `include` used to.
 * Returns a new array; the inputs are not mutated.
 */
export async function withAgentUsers<T extends { userId: string }>(
  rows: T[],
): Promise<Array<T & { user: AgentUser | null }>> {
  const users = await getAgentUsers(rows.map((r) => r.userId));
  return rows.map((r) => ({ ...r, user: users.get(r.userId) ?? null }));
}

/**
 * The retail user id for an email address, for the one query that used to run
 * the other way round (`where: { user: { email } }`).
 */
export async function userIdForEmail(email: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    return user?.id ?? null;
  } catch {
    return null;
  }
}
