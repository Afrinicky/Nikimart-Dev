import { redirect } from "next/navigation";
import { isSellerRegistrationReference, verifyAndSettleVendorFee } from "@/lib/seller-registration";

export const dynamic = "force-dynamic";

/**
 * Where Paystack returns a seller who has just paid to open their shop.
 *
 * Verified by reference rather than by session, because the browser that comes
 * back is not guaranteed to be the one that left, and the webhook settles the
 * same payment independently — so this is the fast path rather than the only
 * one.
 */
export default async function VerifySellerFeePage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = (params.reference || params.trxref || "").trim();
  if (!reference || !isSellerRegistrationReference(reference)) redirect("/seller");

  let settled = false;
  try {
    settled = await verifyAndSettleVendorFee(reference);
  } catch {
    // Couldn't reach Paystack — the webhook settles it independently.
  }
  redirect(settled ? "/seller?fee=paid" : "/seller?fee=pending");
}
