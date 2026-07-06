import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { auth } from "@/lib/auth";
import { isRole, ROLE_HOME } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Create account — NikiMart",
};

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) {
    redirect(isRole(session.user.role) ? ROLE_HOME[session.user.role] : "/account");
  }

  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 ring-1 ring-black/5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-niki-orange to-niki-gold font-display text-lg font-bold text-niki-navy">
            N
          </span>
          <span className="font-display text-xl font-bold text-niki-ink">
            Niki<span className="text-niki-orange">Mart</span>
          </span>
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-niki-ink">Create your account</h1>
        <p className="mt-1 text-sm text-niki-ink/60">Shop, preorder, and track orders on NikiMart.</p>

        <RegisterForm />

        <p className="mt-6 text-center text-sm text-niki-ink/60">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-niki-orange hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </Container>
  );
}
