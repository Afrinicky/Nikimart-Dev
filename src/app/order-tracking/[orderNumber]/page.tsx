import { redirect } from "next/navigation";

/**
 * Kept as a redirect so links already shared in SMS receipts and WhatsApp
 * still land somewhere useful.
 *
 * Tracking now lives at /order-tracking?q=…, because the box has to accept a
 * data reference and a phone number as well as an order number, and neither of
 * those belongs in a path segment. This route previously rendered the order
 * itself — from a hardcoded array of four demo orders, so it had never shown
 * anybody their real purchase.
 */
export default async function OrderTrackingRedirect({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  redirect(`/order-tracking?q=${encodeURIComponent(decodeURIComponent(orderNumber))}`);
}
