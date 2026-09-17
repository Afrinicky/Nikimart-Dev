import { redirect } from "next/navigation";
import { verifyTransaction } from "@/lib/payments";
import {
  afaPaymentCovers,
  dataPaymentCovers,
  isAfaReference,
  isDataReference,
  settleAfaRegistration,
  settleDataOrder,
} from "@/lib/data-bundles/fulfillment";
import { isRegistrationReference, isWalletReference } from "@/lib/data-bundles/reference";
import { verifyAndSettleRegistrationFee } from "@/lib/data-bundles/registration-fee";
import { verifyAndSettleWalletTopup } from "@/lib/data-bundles/wallet";

export const dynamic = "force-dynamic";

/**
 * Paystack redirects an agent here after they pay from their own dashboard —
 * for a topup, or for their registration fee. Same settlement path as the
 * public storefront (see /data-bundles/verify for why verification is by
 * reference rather than session); it just lands them back in the right place.
 */
export default async function VerifyAgentPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = (params.reference || params.trxref || "").trim();

  if (!reference) redirect("/agent");

  // The registration fee settles on its own path: it is not an order, and what
  // it releases — the recruiter's referral reward — is not something an order
  // ever does.
  if (isRegistrationReference(reference)) {
    let settled = false;
    try {
      settled = await verifyAndSettleRegistrationFee(reference);
    } catch {
      // Couldn't reach Paystack — the webhook settles it independently.
    }
    redirect(settled ? "/agent/wallet?fee=paid" : "/agent/wallet?fee=pending");
  }

  // A top-up is not an order either: it buys nothing, it just moves money onto
  // the balance the orders are then paid from.
  if (isWalletReference(reference)) {
    let credited = false;
    try {
      credited = await verifyAndSettleWalletTopup(reference);
    } catch {
      // Couldn't reach Paystack — the webhook credits it independently.
    }
    redirect(credited ? "/agent/wallet?topup=paid" : "/agent/wallet?topup=pending");
  }

  const isAfa = isAfaReference(reference);
  if (!isDataReference(reference) && !isAfa) redirect("/agent");

  let paid = false;
  try {
    const result = await verifyTransaction(reference, "data");
    paid =
      result.paid &&
      result.currency === "GHS" &&
      (isAfa
        ? await afaPaymentCovers(reference, result.amountPesewas)
        : await dataPaymentCovers(reference, result.amountPesewas));
  } catch {
    // Couldn't reach Paystack — the webhook settles it independently.
  }

  if (paid) {
    try {
      if (isAfa) await settleAfaRegistration(reference);
      else await settleDataOrder(reference);
    } catch (err) {
      console.error(
        `[agent] settling ${reference} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    redirect(`/agent/orders/${encodeURIComponent(reference)}`);
  }
  redirect("/agent/orders?status=pending");
}
