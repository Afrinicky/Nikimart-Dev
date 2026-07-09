import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { dashboardFor, isRole, ROLE_HOME } from "@/lib/roles";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname, origin } = req.nextUrl;
  const match = dashboardFor(pathname);

  // Only dashboard routes are gated (see matcher below).
  if (!match) return NextResponse.next();

  const user = req.auth?.user;

  // Not signed in — bounce to login with a return path.
  if (!user) {
    const url = new URL("/login", origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // Signed in but wrong role — send them to their own dashboard.
  const role = user.role;
  if (!isRole(role) || !match.roles.includes(role)) {
    const home = isRole(role) ? ROLE_HOME[role] : "/account";
    return NextResponse.redirect(new URL(home, origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/account/:path*",
    "/seller/:path*",
    "/admin/:path*",
    "/freight/:path*",
    "/pickup/:path*",
  ],
};
