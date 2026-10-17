import { redirect } from "next/navigation";
import { isAffiliateRegistrationReference } from "@/lib/affiliate-reference";
import { verifyAndSettleAffiliateFee } from "@/lib/affiliate-registration";

export const dynamic = "force-dynamic";

/**
 * Where Paystack returns an affiliate who has just paid their registration fee.
 *
 * Verified by reference rather than by session, because the browser that comes
 * back is not guaranteed to be the one that left. The webhook settles the same
 * payment independently, so this is the fast path rather than the only one —
 * which is why a failure here lands on "pending" rather than an error.
 */
export default async function VerifyAffiliateFeePage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = (params.reference || params.trxref || "").trim();
  if (!reference || !isAffiliateRegistrationReference(reference)) redirect("/affiliate/team");

  let settled = false;
  try {
    settled = await verifyAndSettleAffiliateFee(reference);
  } catch {
    // Couldn't reach Paystack — the webhook settles it independently.
  }
  redirect(settled ? "/affiliate/team?fee=paid" : "/affiliate/team?fee=pending");
}
