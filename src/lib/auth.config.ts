import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/lib/roles";

// Edge-safe Auth.js config. Contains no database or Node-only imports so it can
// be pulled into the middleware bundle. The Credentials provider (which needs
// Prisma + bcrypt) is added only in the full config at src/lib/auth.ts.
/**
 * Copy what the token claims onto the session.
 *
 * Exported so the full config can reuse it rather than restating it: that one
 * adds a database check on top, and two copies of this shaping would be two
 * places for the role to stop being copied.
 */
export function applyToken<T extends { user?: { id: string; role: Role } | undefined }>(
  session: T,
  token: unknown,
): T {
  const t = (token ?? {}) as { id?: string; role?: Role };
  if (session.user) {
    if (t.id) session.user.id = t.id;
    if (t.role) session.user.role = t.role;
  }
  return session;
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user.role ?? "CUSTOMER") as Role;
        // Which sign-in this token belongs to. The full config checks it
        // against the account on every request; this half only carries it,
        // because the middleware runs on the edge with no database.
        token.sid = (user as { sid?: string }).sid;
      }
      // Allow a server-side session refresh (e.g. after a customer registers a
      // shop and becomes a SELLER) to update the role without re-logging in.
      if (trigger === "update") {
        const role = (session as { role?: unknown } | null)?.role;
        if (typeof role === "string") token.role = role as Role;
      }
      return token;
    },
    session({ session, token }) {
      return applyToken(session, token);
    },
  },
} satisfies NextAuthConfig;
