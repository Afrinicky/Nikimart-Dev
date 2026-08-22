import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { verifyTransaction } from "@/lib/payments";
import { markOrderPaid, paymentCoversOrder } from "@/lib/order-fulfillment";

export const dynamic = "force-dynamic";

/**
 * Paystack redirects here after payment. We verify the transaction server-side
 * (the source of truth — never trust the redirect alone), mark the order paid,
 * then bounce to the orders page. Both success and failure land the buyer on a
 * clear result.
 */
export default async function VerifyPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const reference = params.reference || params.trxref;

  if (!reference) redirect("/orders");

  // The reference is the order number. Confirm it belongs to this buyer before
  // acting on it.
  const order = await prisma.order.findUnique({
    where: { orderNumber: reference },
    select: { userId: true },
  });
  if (!order || order.userId !== user.id) {
    redirect("/orders");
  }

  let paid = false;
  try {
    const result = await verifyTransaction(reference);
    // Paystack is the source of truth for *whether* it was paid; we still
    // check the captured amount covers the order before settling it.
    paid =
      result.paid &&
      result.currency === "GHS" &&
      (await paymentCoversOrder(reference, result.amountPesewas));
  } catch {
    // Verification failed to reach Paystack — treat as unconfirmed. The webhook
    // can still settle it later.
  }

  // Redirect outside the try/catch: Next's redirect() throws NEXT_REDIRECT,
  // which a catch would otherwise swallow.
  if (paid) {
    // `revalidate: false` because this is a page render — see markOrderPaid.
    // Wrapped as well: the buyer has already been charged, so a settlement
    // hiccup must not put an error screen in front of them. The Paystack
    // webhook settles the order independently if this call didn't.
    try {
      await markOrderPaid(reference, { revalidate: false });
    } catch (err) {
      console.error(`[checkout] settling ${reference} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    redirect(`/orders?placed=${reference}`);
  }
  redirect(`/orders?failed=${reference}`);
}
