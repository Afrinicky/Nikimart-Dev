import { permanentRedirect } from "next/navigation";

/**
 * Preorder Deals is now Shipped from Abroad.
 *
 * A preorder was a window that closed; this is dropshipping that never does.
 * The listings are the same rows in the same table (see lib/abroad on the two
 * spellings of the product type), so the old address redirects rather than
 * 404ing on links that are already out in the world.
 */
export default function PreordersPage() {
  permanentRedirect("/shipped-from-abroad");
}
