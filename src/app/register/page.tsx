import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Field, inputClass } from "@/components/ui/Field";

export const metadata: Metadata = {
  title: "Create account — NikiMart",
};

export default function RegisterPage() {
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

        <form className="mt-6 space-y-4">
          <Field label="Full name" htmlFor="name">
            <input id="name" type="text" placeholder="Ama Mensah" className={inputClass} />
          </Field>
          <Field label="Email address" htmlFor="email">
            <input id="email" type="email" placeholder="you@example.com" className={inputClass} />
          </Field>
          <Field label="Phone number" htmlFor="phone">
            <input id="phone" type="tel" placeholder="024 000 0000" className={inputClass} />
          </Field>
          <Field label="Password" htmlFor="password">
            <input id="password" type="password" placeholder="••••••••" className={inputClass} />
          </Field>
          <button
            type="button"
            className="w-full rounded-xl bg-niki-orange px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            Create account
          </button>
        </form>

        <p className="mt-4 rounded-xl bg-niki-surface p-3 text-center text-xs text-niki-ink/50">
          Accounts &amp; secure sign-in are being wired up — this is a visual preview.
        </p>

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
