import "server-only";
import { randomBytes } from "crypto";
import { cache } from "react";
import NextAuth, { type User as AuthUser } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { dataAuthConfig, applyDataToken } from "@/lib/data-bundles/auth.config";
import { isDataRole } from "@/lib/data-bundles/roles";
import { findDataUserByIdentifier } from "@/lib/data-bundles/user-lookup";
import { sessionAccepted, sessionVerdict } from "@/lib/session-rules";

/**
 * Signing in to the bundle business, against the bundle database.
 *
 * Everything here reads `DataUser` and nothing reads the mall. That is the
 * whole point: in October the mall's Neon project ran out of compute and no
 * agent could sign in, although every bundle, order, ledger row and storefront
 * in this database was healthy and serving. The sign-in was the only thing
 * that still needed the other side to be up, and this is it not needing it.
 *
 * The rules are the mall's rules, because they were the right rules and an
 * agent should not get a weaker account for working in a different business:
 * one live session per account, a second step where the account asks for one,
 * and an issued password that opens nothing until it has been replaced.
 */

const credentialsSchema = z.object({
  // Email address or phone number.
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

export const {
  handlers: dataHandlers,
  auth: dataAuth,
  signIn: dataSignIn,
  signOut: dataSignOut,
} = NextAuth({
  ...dataAuthConfig,
  callbacks: {
    ...dataAuthConfig.callbacks,
    async session({ session, token }) {
      const built = applyDataToken(session, token);
      const t = (token ?? {}) as { id?: string; sid?: string };
      if (!t.id) return built;
      if (!(await dataSessionIsCurrent(t.id, t.sid ?? null))) {
        // No user means not signed in, which is what a superseded token is.
        return { ...built, user: undefined } as unknown as typeof built;
      }
      return built;
    },
  },
  providers: [
    Credentials({
      id: "data-credentials",
      credentials: {
        identifier: { label: "Email or phone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await findDataUserByIdentifier(parsed.data.identifier);
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return claimDataSession(user);
      },
    }),
  ],
});

/**
 * Take the account's one session.
 *
 * A fresh id is minted on each sign-in and written to the account, which is
 * what makes it the only one: any token already out there carries the previous
 * id and stops being accepted the moment this is written.
 */
async function claimDataSession(user: {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  mustChangePassword: boolean;
}): Promise<AuthUser | null> {
  const sid = randomBytes(24).toString("hex");
  try {
    await dataDb.dataUser.update({
      where: { id: user.id },
      data: { activeSessionId: sid, activeSessionAt: new Date() },
    });
  } catch {
    // The database refused the claim, so this token cannot be the one that
    // supersedes the others. Refusing the sign-in is the safe way to fail.
    return null;
  }

  // Cast because `next-auth`'s `User` is augmented once for the whole app, and
  // that one declaration types `role` as the mall's union. The value here is a
  // DataRole and every reader of it goes through session.ts, which says so.
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: isDataRole(user.role) ? user.role : "AGENT",
    mustChangePassword: user.mustChangePassword,
    sid,
  } as unknown as AuthUser;
}

/**
 * Whether this token is still the account's current session.
 *
 * Cached per request: `dataAuth()` is called several times on a page and this
 * would otherwise be a query each time. A database that cannot be reached
 * returns true, the same judgement the mall makes — every caller is about to
 * do database work of its own and will fail on its own terms, and refusing
 * here would turn an outage into a lockout.
 */
const dataSessionIsCurrent = cache(
  async (userId: string, sid: string | null): Promise<boolean> => {
    try {
      const row = await dataDb.dataUser.findUnique({
        where: { id: userId },
        select: { activeSessionId: true },
      });
      if (!row) return false;
      return sessionAccepted(sessionVerdict(sid, row.activeSessionId));
    } catch {
      return true;
    }
  },
);
