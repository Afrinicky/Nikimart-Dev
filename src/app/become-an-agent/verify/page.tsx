import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { isRegistrationReference } from "@/lib/data-bundles/reference";
import { verifyAndSettleApplicationFee } from "@/lib/data-bundles/registration-fee";

export const metadata: Metadata = { title: "Registration payment — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Where Paystack sends an applicant after they pay their registration fee.
 *
 * They have no account yet — that is the whole point of paying here — so this
 * is a public page rather than one inside the console. It verifies by
 * reference, exactly as the storefront's own return page does, and the webhook
 * settles the same payment independently: whichever arrives first wins, and the
 * second is a no-op.
 */
export default async function VerifyApplicationPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = (params.reference || params.trxref || "").trim();
  if (!reference || !isRegistrationReference(reference)) redirect("/become-an-agent");

  let paid = false;
  try {
    paid = await verifyAndSettleApplicationFee(reference);
  } catch {
    // Couldn't reach Paystack — the webhook settles it independently, so this
    // is "we can't see it yet", not "it failed".
  }

  return (
    <div className="niki-gradient-hero min-h-[calc(100vh-4rem)] py-10">
      <Container className="max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <BrandLogo className="h-7 w-auto text-niki-orange" />
          <span className="font-display text-lg font-bold text-white">
            Nick<span className="text-niki-orange">imart</span> Data
          </span>
        </div>

        <div className="rounded-3xl bg-white p-8 text-center shadow-2xl shadow-black/20">
          <span
            className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${
              paid ? "bg-niki-success/10 text-niki-success" : "bg-amber-100 text-amber-700"
            }`}
          >
            {paid ? <Check className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
          </span>

          <h1 className="mt-4 font-display text-xl font-bold text-niki-ink">
            {paid ? "Payment received" : "Payment is still processing"}
          </h1>
          <p className="mt-2 text-sm text-niki-ink/65">
            {paid
              ? "Your application is with us. We'll review it and text you — usually the same day. Once it's approved you can sign in with the password you chose."
              : "We haven't seen your payment confirmed yet. If it went through, it will land shortly and we'll text you."}
          </p>

          <p className="mt-4 font-mono text-xs text-niki-ink/40">{reference}</p>

          <Link
            href="/"
            className="niki-press mt-6 inline-flex rounded-xl bg-niki-black px-5 py-3 text-sm font-bold text-white"
          >
            Back to Nickimart
          </Link>
        </div>
      </Container>
    </div>
  );
}
