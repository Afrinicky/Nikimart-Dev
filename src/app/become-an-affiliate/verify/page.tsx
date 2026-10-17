import { redirect } from "next/navigation";
import { isAffiliateRegistrationReference } from "@/lib/affiliate-reference";
import { verifyAndSettleApplicationFee } from "@/lib/affiliate-registration";

export const dynamic = "force-dynamic";

/**
 * Where Paystack returns somebody who has just paid to join.
 *
 * Verified by reference rather than by session, because the browser that comes
 * back is not guaranteed to be the one that left — and the webhook settles the
 * same payment independently, so this is the fast path rather than the only
 * one. Either way they land back on the registration page, which reads the
 * state off their application and says where it stands.
 */
export default async function VerifyAffiliateApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = (params.reference || params.trxref || "").trim();
  if (!reference || !isAffiliateRegistrationReference(reference)) {
    redirect("/become-an-affiliate");
  }

  let settled = false;
  try {
    settled = await verifyAndSettleApplicationFee(reference);
  } catch {
    // Couldn't reach Paystack — the webhook settles it independently.
  }
  redirect(settled ? "/become-an-affiliate?paid=1" : "/become-an-affiliate?paid=pending");
}
