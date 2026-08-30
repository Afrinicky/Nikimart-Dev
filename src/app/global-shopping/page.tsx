import { permanentRedirect } from "next/navigation";

/**
 * Global Shopping is now Shipped from Abroad.
 *
 * The two pages described the same transaction — this one explained the journey
 * while /preorders listed the items — so they were merged rather than kept in
 * parallel. This route stays because it is linked from bookmarks, the old
 * footer, and anything already indexed; a permanent redirect moves that traffic
 * and tells search engines the address changed rather than that it vanished.
 */
export default function GlobalShoppingPage() {
  permanentRedirect("/shipped-from-abroad");
}
