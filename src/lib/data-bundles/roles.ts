/**
 * Who somebody is inside the bundle business.
 *
 * Two roles, not the mall's five. A mall SELLER, FREIGHT or PICKUP who happens
 * to run a bundle store is simply an AGENT here, because none of those words
 * mean anything in this business — and that is the point of keeping a separate
 * table rather than carrying the mall's role across and hoping it still fits.
 *
 * Pure, so it can be imported from an edge-safe config as well as the server.
 */

export const DATA_ROLES = ["AGENT", "ADMIN"] as const;

export type DataRole = (typeof DATA_ROLES)[number];

export function isDataRole(value: unknown): value is DataRole {
  return typeof value === "string" && (DATA_ROLES as readonly string[]).includes(value);
}

/** Where each role lands after signing in. */
export const DATA_ROLE_HOME: Record<DataRole, string> = {
  AGENT: "/agent",
  ADMIN: "/admin/data",
};
