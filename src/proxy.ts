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
    // Not /agent. The bundle business signs its own people in now, against
    // its own database, and this runs on the edge where that database cannot
    // be read. Gating it here would have meant an agent needed a *mall*
    // session to reach a console the mall knows nothing about — which is
    // exactly the coupling that left every agent locked out when the retail
    // project ran out of compute. The guard lives in src/app/agent/layout.tsx,
    // which reads DataUser and sends anybody without a session to /agent-login.
    "/seller/:path*",
    "/admin/:path*",
    "/freight/:path*",
    "/pickup/:path*",
  ],
};
