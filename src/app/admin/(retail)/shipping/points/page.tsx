import { permanentRedirect } from "next/navigation";

/** Consolidation points are a role a location plays, not a list of their own. */
export default function RetiredConsolidationPointsPage(): never {
  permanentRedirect("/admin/shipping/locations");
}
