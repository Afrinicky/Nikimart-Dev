"use client";

import { useSession } from "next-auth/react";
import { isRole, ROLE_HOME, ROLE_LABELS, type Role } from "@/lib/roles";

/**
 * Who is signed in, resolved in the browser.
 *
 * This used to be a server-side `auth()` call in the header. Reading the
 * session reads cookies, and one dynamic API anywhere in the tree makes the
 * whole route dynamic — with the header in the root layout, that was every page
 * on the site, so nothing could ever be cached and every visit, crawler
 * included, cost a database round trip.
 *
 * Moving it here is what lets the public pages be served from cache. The cost
 * is that the signed-in state arrives a moment after first paint, so callers
 * get `pending` and should render the signed-out state rather than a spinner —
 * the header must not flicker its layout while it waits.
 */
export interface AccountState {
  isAuthed: boolean;
  /** Still resolving. Treat as signed out for layout purposes. */
  pending: boolean;
  /** Where "Account" goes: the person's dashboard, or the login page. */
  href: string;
  /** "Account" once known, "Sign in" before that and when signed out. */
  label: string;
  /** Their role, when it is something other than a plain customer. */
  role: Role | null;
  roleLabel: string | null;
}

export function useAccount(): AccountState {
  const { data, status } = useSession();
  const pending = status === "loading";
  const user = data?.user;
  const role = user && isRole(user.role) ? user.role : null;
  return {
    isAuthed: Boolean(user),
    pending,
    href: role ? ROLE_HOME[role] : "/login",
    label: user ? "Account" : "Sign in",
    role,
    roleLabel: role && role !== "CUSTOMER" ? ROLE_LABELS[role] : null,
  };
}
