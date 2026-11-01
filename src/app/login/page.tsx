import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { SignInModeTabs } from "@/components/auth/SignInModeTabs";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { auth } from "@/lib/auth";
import { isRole, ROLE_HOME } from "@/lib/roles";
import { isAgentUser } from "@/lib/data-bundles/agents";
import { medicalHomeForUser } from "@/lib/medical/home";

export const metadata: Metadata = {
  title: "Sign in — Nickimart",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // The way back in must not be the thing that breaks. Reading the session
  // touches the database, and a read that throws replaced this page with
  // "Something went wrong" — a dead end on the one screen whose entire job is
  // to let somebody through. A session that cannot be read is treated as no
  // session: it costs an already-signed-in visitor a redirect they can make
  // themselves, and it costs everybody else nothing.
  const session = await auth().catch((error: unknown) => {
    console.error("[auth] could not read the session on /login:", error);
    return null;
  });
  const { callbackUrl } = await searchParams;
  const cb = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : undefined;
  if (session?.user) {
    // An agent's home is their console, not the customer account page — the
    // same rule loginAction applies, so arriving here already signed in ends
    // up in the same place as signing in does.
    const role = isRole(session.user.role) ? session.user.role : "CUSTOMER";
    // The same order loginAction uses, so arriving here already signed in ends
    // up where signing in would have put you: medical staff in the medical
    // console, an agent in theirs, everybody else at their role's home.
    const home =
      role === "CUSTOMER" && session.user.id
        ? ((await medicalHomeForUser(session.user.id)) ??
          ((await isAgentUser(session.user.id)) ? "/agent" : ROLE_HOME[role]))
        : ROLE_HOME[role];
    redirect(cb ?? home);
  }

  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 ring-1 ring-niki-edge">
        <div className="flex items-center gap-2">
          <BrandLogo className="h-8 w-auto text-niki-orange" />
          <span className="font-display text-xl font-bold text-niki-ink">
            Nick<span className="text-niki-orange">imart</span>
          </span>
        </div>
        <h1 className="mt-6 mb-4 font-display text-2xl font-bold text-niki-ink">Welcome back</h1>

        {/* Agents land on the homepage like everyone else and press Sign in.
            Before this they got the mall's form, which cannot sign them in,
            and nothing said where else to go. */}
        <SignInModeTabs callbackUrl={cb} registerHref={cb ? `/register?callbackUrl=${encodeURIComponent(cb)}` : "/register"} />
      </div>
    </Container>
  );
}
