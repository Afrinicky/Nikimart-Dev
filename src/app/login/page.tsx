import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { LoginForm } from "@/components/auth/LoginForm";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { auth } from "@/lib/auth";
import { isRole, ROLE_HOME } from "@/lib/roles";
import { isAgentUser } from "@/lib/data-bundles/agents";

export const metadata: Metadata = {
  title: "Sign in — Nickimart",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  const cb = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : undefined;
  if (session?.user) {
    // An agent's home is their console, not the customer account page — the
    // same rule loginAction applies, so arriving here already signed in ends
    // up in the same place as signing in does.
    const role = isRole(session.user.role) ? session.user.role : "CUSTOMER";
    const home =
      role === "CUSTOMER" && session.user.id && (await isAgentUser(session.user.id))
        ? "/agent"
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
        <h1 className="mt-6 font-display text-2xl font-bold text-niki-ink">Welcome back</h1>
        <p className="mt-1 text-sm text-niki-ink/60">Sign in to your Nickimart account.</p>

        <LoginForm callbackUrl={cb} />

        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="font-semibold text-niki-orange hover:underline">
            Forgot your password?
          </Link>
        </p>

        <p className="mt-6 text-center text-sm text-niki-ink/60">
          New to Nickimart?{" "}
          <Link href={cb ? `/register?callbackUrl=${encodeURIComponent(cb)}` : "/register"} className="font-semibold text-niki-orange hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </Container>
  );
}
