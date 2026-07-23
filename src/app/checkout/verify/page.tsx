import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { verifyTransaction } from "@/lib/payments";
import { markOrderPaid } from "@/lib/order-fulfillment";

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
    paid = result.paid;
  } catch {
    // Verification failed to reach Paystack — treat as unconfirmed. The webhook
    // can still settle it later.
  }

  // Redirect outside the try/catch: Next's redirect() throws NEXT_REDIRECT,
  // which a catch would otherwise swallow.
  if (paid) {
    await markOrderPaid(reference);
    redirect(`/orders?placed=${reference}`);
  }
  redirect(`/orders?failed=${reference}`);
}
