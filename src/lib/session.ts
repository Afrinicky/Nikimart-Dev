import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccess, isRole, ROLE_HOME, type Role } from "@/lib/roles";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
}

/** Returns the signed-in user or redirects to /login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role: Role = isRole(session.user.role) ? session.user.role : "CUSTOMER";
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    role,
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
