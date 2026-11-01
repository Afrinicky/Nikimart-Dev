import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { OtpResetFlow } from "@/components/auth/OtpResetFlow";
import { BUNDLE_RESET_ACTIONS } from "@/lib/data-bundles/reset-card-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Forgot password — NikiMart Data" };

/**
 * Getting back into an agent account.
 *
 * Outside /agent, beside /agent-login, because somebody who cannot sign in
 * cannot be behind the console guard — and a reset page that redirects you to
 * sign in first is a joke at the expense of the person who needs it.
 *
 * It reads and writes only the bundle database, so it works with the retail
 * database switched off. That is the point: before this, an agent who forgot
 * their password had to wait for an administrator, and an agent locked out by
 * repeated wrong passwords had no way back at all.
 */
export default function AgentForgotPasswordPage() {
  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 ring-1 ring-niki-edge">
        <div className="flex items-center gap-2">
          <BrandLogo className="h-8 w-auto text-niki-orange" />
          <span className="font-display text-xl font-bold text-niki-ink">
            Niki<span className="text-niki-orange">Mart</span> Data
          </span>
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-niki-ink">
          Forgot your password?
        </h1>
        <p className="mt-1 mb-5 text-sm text-niki-ink/60">
          Enter the email or phone number on your agent account and we&apos;ll send a 6-digit
          code by SMS and email. Setting a new password also lifts a sign-in lock.
        </p>
        <OtpResetFlow actions={BUNDLE_RESET_ACTIONS} />
      </div>
    </Container>
  );
}
