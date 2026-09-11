"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Makes the signed-in user available to client components.
 *
 * The header needs to know who is signed in. It used to ask on the server,
 * which read cookies, which made every route on the site dynamic and stopped
 * anything being cached. Now the pages render once and this resolves the person
 * in the browser afterwards.
 */
export function AuthSession({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
