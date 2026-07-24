import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Forgot password — NikiMart" };

export default function ForgotPasswordPage() {
  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 ring-1 ring-black/5">
        <div className="flex items-center gap-2">
          <BrandLogo className="h-9 w-9" />
          <span className="font-display text-xl font-bold text-niki-ink">
            Niki<span className="text-niki-orange">Mart</span>
          </span>
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-niki-ink">Forgot your password?</h1>
        <p className="mt-1 mb-5 text-sm text-niki-ink/60">
          Enter your email or phone number and we&apos;ll send a reset link by SMS and email.
        </p>
        <ForgotPasswordForm />
      </div>
    </Container>
  );
}
