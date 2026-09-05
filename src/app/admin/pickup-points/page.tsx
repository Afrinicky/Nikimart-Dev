import { permanentRedirect } from "next/navigation";

/**
 * Pickup points moved into the shipping console.
 *
 * They were managed here and consolidation points were managed there, so the
 * same building was typed in twice under two names and the two screens
 * disagreed about what existed. They are one list now, with a tick box for each
 * role. Anything still linking here — a bookmark, an old email — lands where
 * the settings actually live.
 */
export default function RetiredPickupPointsPage(): never {
  permanentRedirect("/admin/shipping/locations");
}
