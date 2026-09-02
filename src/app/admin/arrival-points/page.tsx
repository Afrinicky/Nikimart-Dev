import { permanentRedirect } from "next/navigation";

/**
 * Arrival points moved into the shipping console.
 *
 * They were never a separate concern — an arrival point is a consolidation
 * point that happens to be international — and keeping them on their own tab
 * meant the same warehouse had to be modelled twice. Anything still linking
 * here (a bookmark, an old email, a stale build) lands where the settings
 * actually live.
 */
export default function RetiredArrivalPointsPage(): never {
  permanentRedirect("/admin/shipping/points");
}
