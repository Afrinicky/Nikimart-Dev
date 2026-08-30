import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { verifyTransaction } from "@/lib/payments";
import { getAgentBySlug } from "@/lib/data-bundles/agents";
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
 * Paystack redirects an agent storefront's buyer here after payment. Identical
 * settlement to /data-bundles/verify — verified by reference against Paystack,
 * never by trusting the redirect — it just lands them back on the store they
 * bought from rather than on Nickimart's own page.
 */
export default async function VerifyStorePaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const agent = await getAgentBySlug(slug);
  if (!agent) notFound();

  const home = `/store/${agent.slug}`;
  const tracker = `${home}/orders`;
  const reference = (query.reference || query.trxref || "").trim();

  if (!reference) redirect(home);

  const isAfa = isAfaReference(reference);
  if (!isDataReference(reference) && !isAfa) redirect(home);

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
    // The buyer has already been charged, so this must never show them an
    // error screen: if settlement throws, land them on their order anyway.
    try {
      if (isAfa) await settleAfaRegistration(reference);
      else await settleDataOrder(reference);
    } catch (err) {
      console.error(
        `[store] settling ${reference} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const done = isAfa ? "afa" : "paid";
    redirect(`${tracker}?q=${encodeURIComponent(reference)}&${done}=1`);
  }
  redirect(`${tracker}?q=${encodeURIComponent(reference)}&failed=1`);
}
