import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/lib/roles";

// Edge-safe Auth.js config. Contains no database or Node-only imports so it can
// be pulled into the middleware bundle. The Credentials provider (which needs
// Prisma + bcrypt) is added only in the full config at src/lib/auth.ts.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user.role ?? "CUSTOMER") as Role;
      }
      return token;
    },
    session({ session, token }) {
      const t = token as { id?: string; role?: Role };
      if (session.user) {
        if (t.id) session.user.id = t.id;
        if (t.role) session.user.role = t.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
