import { permanentRedirect } from "next/navigation";

/**
 * Locations moved into the shipping console.
 *
 * A campus, a pickup point and a forwarder's warehouse are three answers to
 * one question — where goods are — and managing them from three sidebar
 * entries meant the picker and the rate grid could quietly disagree about what
 * existed. They are tabs of one module now.
 */
export default function RetiredLocationsPage(): never {
  permanentRedirect("/admin/shipping/areas");
}
