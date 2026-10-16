import { redirect } from "next/navigation";

/**
 * Order placement is a tab of order fulfilment now, not a module of its own.
 *
 * Every row in the placement queue is a line of an order on the other screen,
 * and two sidebar entries made them read as two unrelated jobs. This keeps the
 * old address working — it is in bookmarks, in revalidation calls and in the
 * seller-facing copy — and sends it where the screen went.
 */
export default function AdminPurchasingRedirect() {
  redirect("/admin/orders/placement");
}
