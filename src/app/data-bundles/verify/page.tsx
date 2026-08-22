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
 * Paystack redirects bundle buyers here after payment.
 *
 * Bundle checkout is open to guests, so there's no session to check the
 * reference against. Safety comes from the reference itself: Paystack is asked
 * server-side whether *that* transaction succeeded and for how much, and the
 * order is only settled when the captured amount covers it. Someone replaying a
 * stranger's reference can at most settle an order that was genuinely paid for.
 */
export default async function VerifyDataPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = (params.reference || params.trxref || "").trim();

  if (!reference) redirect("/data-bundles");

  const isAfa = isAfaReference(reference);
  if (!isDataReference(reference) && !isAfa) redirect("/data-bundles");

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
    // Couldn't reach Paystack — treat as unconfirmed. The webhook settles it
    // later, and the lookup page tells the buyer exactly that.
  }

  // Redirect outside the try/catch: Next's redirect() throws NEXT_REDIRECT,
  // which a catch would otherwise swallow.
  if (paid) {
    // The buyer has already been charged, so this must not be able to show them
    // an error screen. If settlement throws, we still land them on their order
    // with its reference, and the Paystack webhook settles it independently.
    try {
      if (isAfa) await settleAfaRegistration(reference);
      else await settleDataOrder(reference);
    } catch (err) {
      console.error(`[data-bundles] settling ${reference} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const done = isAfa ? "afa" : "paid";
    redirect(`/data-bundles/orders?q=${encodeURIComponent(reference)}&${done}=1`);
  }
  redirect(`/data-bundles/orders?q=${encodeURIComponent(reference)}&failed=1`);
}
