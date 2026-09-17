import { redirect } from "next/navigation";
import { verifyTransaction } from "@/lib/payments";
import { requireAdmin } from "@/lib/session";
import {
  dataPaymentCovers,
  isDataReference,
  settleDataOrder,
} from "@/lib/data-bundles/fulfillment";

export const dynamic = "force-dynamic";

/**
 * Where Paystack returns an admin who has just bought a bundle.
 *
 * Its own page rather than the agent's, because the agent's ends on a screen
 * an admin has no access to — and a payer bounced by a role guard is a payer
 * who thinks their money vanished. Settlement is by reference and idempotent,
 * exactly as everywhere else; the webhook settles it independently too.
 */
export default async function AdminTopupVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const reference = (params.reference || params.trxref || "").trim();
  if (!reference || !isDataReference(reference)) redirect("/admin/data/orders");

  let paid = false;
  try {
    const result = await verifyTransaction(reference, "data");
    paid =
      result.paid &&
      result.currency === "GHS" &&
      (await dataPaymentCovers(reference, result.amountPesewas));
  } catch {
    // Couldn't reach Paystack — the webhook settles it independently.
  }

  if (paid) {
    try {
      await settleDataOrder(reference);
    } catch (err) {
      console.error(
        `[admin] settling ${reference} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  redirect(`/admin/data/orders?q=${encodeURIComponent(reference)}`);
}
