import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    /** The sign-in this account is currently allowed to hold. */
    sid?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    /**
     * Which sign-in this token belongs to. Checked against the account on
     * every request: a token whose sid is not the current one was signed in
     * before somebody else signed in, and is no longer valid.
     */
    sid?: string;
  }
}
