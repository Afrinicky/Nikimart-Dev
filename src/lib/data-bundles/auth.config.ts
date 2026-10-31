import type { NextAuthConfig } from "next-auth";
import type { DataRole } from "@/lib/data-bundles/roles";

/**
 * The edge-safe half of the bundle business's own sign-in.
 *
 * Deliberately a second Auth.js instance rather than another provider bolted
 * onto the mall's. Two instances mean two cookies and two sessions, so an
 * agent signing in to their console does not thereby hold a mall session, and
 * — the reason any of this exists — a mall outage cannot invalidate a bundle
 * session, because nothing about one is written in the other's database.
 *
 * No database or Node-only import here, the same rule the mall's config keeps,
 * so this half can be pulled into a middleware bundle if it ever needs to be.
 */

/**
 * Copy what the token claims onto the session.
 *
 * Structural rather than typed against `Session`, because the app's one
 * `next-auth` module augmentation declares `session.user.role` as the *mall's*
 * Role union — there is only one such declaration to go round, and this
 * instance's roles are not those. The shape is read through a cast instead,
 * which is honest about the fact that two different businesses are sharing one
 * library's global types. `requireAgent()` in session.ts is where a caller
 * gets a properly typed DataRole back.
 */
export function applyDataToken<T>(session: T, token: unknown): T {
  const t = (token ?? {}) as { id?: string; role?: DataRole };
  const shaped = session as unknown as { user?: { id?: string; role?: string } };
  if (shaped.user) {
    if (t.id) shaped.user.id = t.id;
    if (t.role) shaped.user.role = t.role;
  }
  return session;
}

/**
 * The cookie this instance keeps its session in.
 *
 * Named apart from the mall's so the two sit side by side in one browser: a
 * person who is both an agent and a customer is signed in to both consoles at
 * once, and signing out of one leaves the other alone. Auth.js prefixes its
 * own cookie with `__Secure-` over HTTPS, so this one does the same.
 */
const COOKIE = "authjs.data-session-token";

export const dataAuthConfig = {
  basePath: "/api/data-auth",
  pages: {
    signIn: "/agent-login",
  },
  session: {
    strategy: "jwt",
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? `__Secure-${COOKIE}` : COOKIE,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = ((user as { role?: string }).role ?? "AGENT") as DataRole;
        // Which sign-in this token belongs to; the full config checks it
        // against the account on every request.
        token.sid = (user as { sid?: string }).sid;
        token.mustChangePassword = Boolean(
          (user as { mustChangePassword?: boolean }).mustChangePassword,
        );
      }
      return token;
    },
    session({ session, token }) {
      return applyDataToken(session, token);
    },
  },
} satisfies NextAuthConfig;
