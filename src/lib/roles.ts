// Central definition of user roles and the dashboards each role can reach.
// SQLite has no native enums, so roles live as strings validated here.

export const ROLES = ["CUSTOMER", "SELLER", "ADMIN", "FREIGHT", "PICKUP"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: "Customer",
  SELLER: "Seller",
  ADMIN: "Administrator",
  FREIGHT: "Freight Agent",
  PICKUP: "Pickup Operator",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** The dashboard home a role lands on after signing in. */
export const ROLE_HOME: Record<Role, string> = {
  CUSTOMER: "/account",
  SELLER: "/seller",
  ADMIN: "/admin",
  FREIGHT: "/freight",
  PICKUP: "/pickup",
};

/**
 * Which roles may access a given dashboard path. ADMIN can reach everything.
 * Used by middleware and by the dashboard pages themselves.
 */
export const DASHBOARD_ACCESS: Record<string, Role[]> = {
  "/account": ["CUSTOMER", "SELLER", "ADMIN", "FREIGHT", "PICKUP"],
  "/seller": ["SELLER", "ADMIN"],
  "/admin": ["ADMIN"],
  "/freight": ["FREIGHT", "ADMIN"],
  "/pickup": ["PICKUP", "ADMIN"],
};

/** Returns the access list for the dashboard that owns `pathname`, or null. */
export function dashboardFor(pathname: string): { base: string; roles: Role[] } | null {
  for (const base of Object.keys(DASHBOARD_ACCESS)) {
    if (pathname === base || pathname.startsWith(`${base}/`)) {
      return { base, roles: DASHBOARD_ACCESS[base] };
    }
  }
  return null;
}

export function canAccess(role: Role, pathname: string): boolean {
  const match = dashboardFor(pathname);
  if (!match) return true;
  return match.roles.includes(role);
}
