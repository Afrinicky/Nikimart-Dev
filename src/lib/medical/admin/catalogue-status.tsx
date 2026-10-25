import { makeStatus } from "@/components/medical/console/StatusBadge";

/**
 * The catalogue's status vocabulary.
 *
 * In its own module rather than on the list page, so the detail page does not
 * have to import a page to render a badge — that works, but it drags a route's
 * whole module into another route's bundle for the sake of one map.
 *
 * Archived is deliberately `neutral` rather than `bad`: archiving is the
 * correct end of a product's life here, not a failure. A product that has been
 * quoted or sold cannot be deleted without breaking the documents that
 * reference it.
 */
export const productStatus = makeStatus({
  DRAFT: { label: "Draft", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "good" },
  OUT_OF_STOCK: { label: "Out of stock", tone: "warn" },
  DISCONTINUED: { label: "Discontinued", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
});
