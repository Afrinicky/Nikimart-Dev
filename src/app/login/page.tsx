import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { LoginForm } from "@/components/auth/LoginForm";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { auth } from "@/lib/auth";
import { isRole, ROLE_HOME } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Sign in — NikiMart",
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect(isRole(session.user.role) ? ROLE_HOME[session.user.role] : "/account");
  }

  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 ring-1 ring-black/5">
        <div className="flex items-center gap-2">
          <BrandLogo className="h-9 w-9" />
          <span className="font-display text-xl font-bold text-niki-ink">
            Niki<span className="text-niki-orange">Mart</span>
          </span>
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-niki-ink">Welcome back</h1>
        <p className="mt-1 text-sm text-niki-ink/60">Sign in to your NikiMart account.</p>

        <LoginForm />

        <p className="mt-4 rounded-xl bg-niki-surface p-3 text-center text-xs text-niki-ink/50">
          Try a demo account, e.g. <span className="font-semibold">customer@nikimart.test</span> /{" "}
          <span className="font-semibold">password123</span>.
        </p>

        <p className="mt-6 text-center text-sm text-niki-ink/60">
          New to NikiMart?{" "}
          <Link href="/register" className="font-semibold text-niki-orange hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </Container>
  );
}
