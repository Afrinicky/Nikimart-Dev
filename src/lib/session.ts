import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccess, isRole, ROLE_HOME, type Role } from "@/lib/roles";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
}

/**
 * The account's *current* role, straight from the database.
 *
 * The session is a JWT, so the role baked into it is only as fresh as the last
 * sign-in: demoting an admin, suspending a seller, or deleting an account left
 * their existing token working until it expired. Every authorisation decision
 * reads the role from here instead. Cached per request, so the extra lookup
 * costs one query per render even when several guards run.
 */
type RoleLookup =
  | { status: "found"; role: Role }
  | { status: "missing" } // the account no longer exists
  | { status: "unavailable" }; // the database couldn't be reached

const currentRole = cache(async (userId: string): Promise<RoleLookup> => {
  try {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!row) return { status: "missing" };
    return { status: "found", role: isRole(row.role) ? row.role : "CUSTOMER" };
  } catch {
    return { status: "unavailable" };
  }
});

/** Returns the signed-in user or redirects to /login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const lookup = await currentRole(session.user.id);
  // A token for a deleted account is worthless — send them back to sign in.
  if (lookup.status === "missing") redirect("/login");

  // If the database is unreachable we keep the token's claim rather than
  // locking everyone out; it's still a token we signed, just possibly stale.
  const claimed: Role = isRole(session.user.role) ? session.user.role : "CUSTOMER";

  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    role: lookup.status === "found" ? lookup.role : claimed,
  };
}

/**
 * Guards a dashboard page: ensures the user is signed in and their role may
 * access `pathname`, otherwise redirects them to their own dashboard. Mirrors
 * the middleware so pages are safe even if the matcher ever changes.
 */
export async function requireDashboard(pathname: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAccess(user.role, pathname)) {
    redirect(ROLE_HOME[user.role]);
  }
  return user;
}

/** Guards an admin-only server action. Throws if the caller isn't an admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new Error("Forbidden: admin access required.");
  }
  return user;
}
