import "server-only";
import { dataDb } from "@/lib/data-db";

/**
 * Joining an agent to the person behind it.
 *
 * This used to be the one thing that crossed the line: `DataAgent.userId` held
 * a `User.id` in the *retail* database, which Postgres cannot follow, so every
 * roster in the console paid a hop into the mall — and lost the names entirely
 * whenever the mall was unreachable, which is how a bundle console ended up
 * showing a page of blanks during a retail outage.
 *
 * It no longer crosses. The ids are unchanged, because `DataUser` was copied
 * keeping them, so `DataAgent.userId` resolves against a table in this same
 * database and the join is local. Still two queries rather than an `include`,
 * because the column is deliberately not a foreign key — the shape is kept so
 * that nothing which used it had to change, and so that an agent whose login
 * has not been copied yet resolves to null rather than throwing. An agent
 * without a person is a support problem, not a reason to stop rendering.
 */

/** The fields any screen needs about the person behind an agent. */
export interface AgentUser {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  /**
   * Whether they can sign in to this business. The hash itself is read here
   * and reduced to a boolean immediately — it never leaves this module.
   */
  canSignIn: boolean;
}

/** Look up several users at once, keyed by id. Missing ids are simply absent. */
export async function getAgentUsers(userIds: string[]): Promise<Map<string, AgentUser>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  try {
    const rows = await dataDb.dataUser.findMany({
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
 * The user id for an email address, for the one query that used to run the
 * other way round (`where: { user: { email } }`).
 */
export async function userIdForEmail(email: string): Promise<string | null> {
  try {
    const user = await dataDb.dataUser.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    return user?.id ?? null;
  } catch {
    return null;
  }
}
