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

export const dynamic = "force-dynamic";

/**
 * Paystack redirects an agent here after they pay for a topup from their own
 * dashboard. Same settlement path as the public storefront — see
 * /data-bundles/verify for why verification is by reference rather than session
 * — it just lands them back in their own orders list.
 */
export default async function VerifyAgentPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = (params.reference || params.trxref || "").trim();

  if (!reference) redirect("/agent");

  const isAfa = isAfaReference(reference);
  if (!isDataReference(reference) && !isAfa) redirect("/agent");

  let paid = false;
  try {
    const result = await verifyTransaction(reference);
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
