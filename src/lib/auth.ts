import { randomBytes } from "crypto";
import { cache } from "react";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { applyToken, authConfig } from "@/lib/auth.config";
import { isRole } from "@/lib/roles";
import { findUserByIdentifier } from "@/lib/user-lookup";
import { sessionAccepted, sessionVerdict } from "@/lib/session-rules";
import { consumeChallenge } from "@/lib/two-factor";

const credentialsSchema = z.object({
  // Email address or phone number.
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

const twoFactorSchema = z.object({
  challengeId: z.string().trim().min(1),
  code: z.string().trim().regex(/^\d{6}$/),
});

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    /**
     * The one gate every caller passes through.
     *
     * Putting the check here rather than in each guard means a page, a server
     * action, an API route and anything written later all get it without
     * having to remember to ask: a superseded token simply has no user on it,
     * and everything that requires one redirects to sign in as it already
     * does for a token with no user at all.
     */
    async session({ session, token }) {
      const built = applyToken(session, token);
      const t = (token ?? {}) as { id?: string; sid?: string };
      if (!t.id) return built;
      // A token with no session id predates single sign-in and cannot be shown
      // to be the current one, so it is not treated as current.
      if (!(await sessionIsCurrent(t.id, t.sid ?? null))) {
        // No user means not signed in, which is what a superseded token is.
        return { ...built, user: undefined } as unknown as typeof built;
      }
      return built;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email or phone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await findUserByIdentifier(parsed.data.email);
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        // An account with a second step never completes on the password alone.
        // The check is here as well as in the sign-in action because this
        // provider is the door: anything that can reach it must be held to the
        // same rule, whatever route it came by.
        if (await hasTwoFactor(user.id)) return null;

        return claimSession(user);
      },
    }),

    /**
     * The second step, as a sign-in of its own.
     *
     * A challenge is only ever created once a password has been checked, so
     * spending one is proof of both halves. Doing it this way means the
     * password is never held anywhere between the two steps — not in a cookie,
     * not in a hidden field, not in the form state that goes back to the
     * browser.
     */
    Credentials({
      id: "two-factor",
      credentials: {
        challengeId: { label: "Challenge", type: "text" },
        code: { label: "Code", type: "text" },
      },
      authorize: async (credentials) => {
        const parsed = twoFactorSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const spent = await consumeChallenge(parsed.data.challengeId, parsed.data.code, "SIGN_IN");
        if (!spent.ok || !spent.userId) return null;

        const user = await prisma.user.findUnique({
          where: { id: spent.userId },
          select: { id: true, name: true, email: true, image: true, role: true },
        });
        return user ? await claimSession(user) : null;
      },
    }),
  ],
});

/**
 * Take the account's one session.
 *
 * Signing in mints a fresh id and writes it to the account, which is what
 * makes it the *only* session: any token already out there carries the
 * previous id and stops being accepted the moment this one is written. Newest
 * wins, deliberately — refusing the new sign-in instead would lock somebody
 * out of their own account because of a tab they forgot on a borrowed phone.
 */
async function claimSession(user: {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
}) {
  const sid = randomBytes(24).toString("hex");
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { activeSessionId: sid, activeSessionAt: new Date() },
    });
  } catch {
    // The database refused the claim, so this token cannot be the one that
    // supersedes the others. Refusing the sign-in is the safe way to fail:
    // letting it through would be a second live session, which is the whole
    // thing this prevents.
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: isRole(user.role) ? user.role : "CUSTOMER",
    sid,
  };
}

/**
 * Whether this token is still the account's current session.
 *
 * Cached per request: `auth()` is called several times on a page and this
 * would otherwise be a query each time.
 *
 * A database that cannot be reached returns true. Every caller is about to do
 * database work of its own and will fail on its own terms; refusing here would
 * turn an outage into a lockout for everybody, including the people holding
 * the only valid session.
 */
const sessionIsCurrent = cache(async (userId: string, sid: string | null): Promise<boolean> => {
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { activeSessionId: true },
    });
    if (!row) return false;
    return sessionAccepted(sessionVerdict(sid, row.activeSessionId));
  } catch {
    return true;
  }
});

/** Whether this account asks for a code after the password. */
async function hasTwoFactor(userId: string): Promise<boolean> {
  const row = await prisma.user
    .findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } })
    .catch(() => null);
  return row?.twoFactorEnabled ?? false;
}
