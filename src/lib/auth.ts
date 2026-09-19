import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { isRole } from "@/lib/roles";
import { findUserByIdentifier } from "@/lib/user-lookup";
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

        return sessionUser(user);
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
        return user ? sessionUser(user) : null;
      },
    }),
  ],
});

function sessionUser(user: {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: isRole(user.role) ? user.role : "CUSTOMER",
  };
}

/** Whether this account asks for a code after the password. */
async function hasTwoFactor(userId: string): Promise<boolean> {
  const row = await prisma.user
    .findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } })
    .catch(() => null);
  return row?.twoFactorEnabled ?? false;
}
