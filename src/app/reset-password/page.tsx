import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Reset password — NikiMart" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 ring-1 ring-black/5">
        <div className="flex items-center gap-2">
          <BrandLogo className="h-9 w-9" />
          <span className="font-display text-xl font-bold text-niki-ink">
            Niki<span className="text-niki-orange">Mart</span>
          </span>
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-niki-ink">Set a new password</h1>
        {token ? (
          <>
            <p className="mt-1 mb-5 text-sm text-niki-ink/60">Choose a new password for your account.</p>
            <ResetPasswordForm token={token} />
          </>
        ) : (
          <div className="mt-4 rounded-xl bg-niki-danger/10 p-4 text-sm text-niki-ink/70">
            This reset link is missing its token.{" "}
            <Link href="/forgot-password" className="font-semibold text-niki-orange hover:underline">
              Request a new link
            </Link>
            .
          </div>
        )}
      </div>
    </Container>
  );
}
