import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { activeWorkspace, type Workspace, type WorkspaceIcon } from "@/lib/workspace-nav";

// The type and the path matcher live in a pure module so the client-side
// switcher can import them too; re-exported here so server callers have one
// place to look.
export { activeWorkspace };
export type { Workspace, WorkspaceIcon };

/**
 * The consoles one person can reach.
 *
 * Nickimart is four businesses to the people who work in it, and the same
 * person is often in more than one: a bundle agent who also sells retail, a
 * seller who promotes other shops' listings, an admin who is all of it. The
 * admin console already had a way across — Retail and Data bundles as two
 * entries in the same sidebar — and that is the pattern, applied to everybody.
 *
 * Membership, not role, is what decides. A workspace appears because there is
 * an account behind it: a Vendor row, a DataAgent row, an Affiliate row. So
 * nothing here can offer somebody a console they would be bounced out of, and
 * a sidebar with one entry in it is simply the person who has one job.
 *
 * Icons travel as names rather than components — a function cannot cross from
 * a server component into a client one.
 */

export interface WorkspaceUser {
  id: string;
  role: string;
}

/**
 * Every console this person may open, in the order they would expect them.
 *
 * Cached per request: the shells of three different consoles ask for this on
 * the same render when somebody switches between them.
 */
export const getWorkspaces = cache(async (user: WorkspaceUser): Promise<Workspace[]> => {
  const [vendor, agent, affiliate] = await Promise.all([
    prisma.vendor
      .findUnique({ where: { ownerId: user.id }, select: { id: true, verificationStatus: true } })
      .catch(() => null),
    getAgentForUser(user.id),
    prisma.affiliate
      .findUnique({ where: { userId: user.id }, select: { id: true, status: true } })
      .catch(() => null),
  ]);

  const spaces: Workspace[] = [];

  if (user.role === "ADMIN") {
    spaces.push(
      { key: "admin", label: "Retail", hint: "Admin console", href: "/admin", icon: "shield" },
      { key: "admin-data", label: "Data bundles", hint: "Admin console", href: "/admin/data", icon: "signal" },
    );
  }

  // A shop still awaiting verification is a real workspace: it is where the
  // owner goes to finish setting it up.
  if (vendor) {
    spaces.push({ key: "seller", label: "My shop", hint: "Sell on Nickimart", href: "/seller", icon: "store" });
  }

  if (agent) {
    spaces.push({ key: "agent", label: "Data bundles", hint: "My agent store", href: "/agent", icon: "signal" });
  }

  if (affiliate) {
    spaces.push({ key: "affiliate", label: "Affiliate", hint: "Promote & earn", href: "/affiliate", icon: "gift" });
  }

  return spaces;
});
