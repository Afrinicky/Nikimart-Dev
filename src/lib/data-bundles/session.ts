import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { dataAuth } from "@/lib/data-bundles/auth";
import { dataDb } from "@/lib/data-db";
import { isDataRole, type DataRole } from "@/lib/data-bundles/roles";

/**
 * The guards for the bundle consoles.
 *
 * The twin of src/lib/session.ts, reading `DataUser` instead of the mall's
 * `User`. Nothing here touches the retail database, which is the entire
 * purpose: the agent console and the bundle admin console go on working
 * through a retail outage, because none of what they need is written down
 * over there.
 *
 * The judgements are the mall's, for the same reasons it makes them. A role
 * is re-read from the database on every request rather than trusted from the
 * token, so suspending somebody takes effect at once instead of whenever their
 * token happens to expire. A database that cannot be reached keeps the token's
 * claim rather than locking everybody out — it is still a token we signed,
 * just possibly stale. An account that has gone is sent back to sign in.
 */

export interface DataSessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: DataRole;
}

type RoleLookup =
  | { status: "found"; role: DataRole }
  | { status: "missing" } // the account no longer exists here
  | { status: "unavailable" }; // even this database could not be reached

const currentDataRole = cache(async (userId: string): Promise<RoleLookup> => {
  try {
    const row = await dataDb.dataUser.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!row) return { status: "missing" };
    return { status: "found", role: isDataRole(row.role) ? row.role : "AGENT" };
  } catch {
    return { status: "unavailable" };
  }
});

/** The signed-in bundle user, or a redirect to the bundle sign-in page. */
export async function requireDataUser(): Promise<DataSessionUser> {
  const session = await dataAuth().catch(() => null);
  if (!session?.user?.id) redirect("/agent-login");

  const lookup = await currentDataRole(session.user.id);
  // A token for an account that has been removed from this business is worth
  // nothing here, whatever the mall still thinks.
  if (lookup.status === "missing") redirect("/agent-login");

  const claimed: DataRole = isDataRole(session.user.role) ? session.user.role : "AGENT";

  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    role: lookup.status === "found" ? lookup.role : claimed,
  };
}

/**
 * The bundle admin console's guard.
 *
 * An agent who finds their way to /admin/data is sent to their own console
 * rather than to sign in again: they are signed in perfectly well, just not as
 * somebody who runs the place. Sending them to a sign-in form they would pass
 * and be bounced from again is the redirect loop this codebase has already
 * been bitten by once.
 */
export async function requireDataAdmin(): Promise<DataSessionUser> {
  const user = await requireDataUser();
  if (user.role !== "ADMIN") redirect("/agent");
  return user;
}

/** Guards a bundle-side server action. Throws rather than redirects. */
export async function requireDataAdminAction(): Promise<DataSessionUser> {
  const user = await requireDataUser();
  if (user.role !== "ADMIN") {
    throw new Error("Forbidden: this action is for the bundle administrators.");
  }
  return user;
}

/**
 * The signed-in bundle user, or null — for the places that want to know
 * without insisting, such as a public storefront deciding whether to show an
 * agent their own "edit this store" affordance.
 */
export async function dataUserOrNull(): Promise<DataSessionUser | null> {
  const session = await dataAuth().catch(() => null);
  if (!session?.user?.id) return null;
  const lookup = await currentDataRole(session.user.id);
  if (lookup.status === "missing") return null;
  const claimed: DataRole = isDataRole(session.user.role) ? session.user.role : "AGENT";
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    role: lookup.status === "found" ? lookup.role : claimed,
  };
}
