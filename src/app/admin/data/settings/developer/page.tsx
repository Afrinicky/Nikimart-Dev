import { redirect } from "next/navigation";
import { CARRIER_CATALOG } from "@/lib/data-bundles/carriers/rules";

export const dynamic = "force-dynamic";

/**
 * The Developer tab itself has no content — every carrier has its own page.
 * Landing on the first one beats an index that would say nothing the tab row
 * above it does not already say.
 */
export default function DeveloperIndexPage() {
  redirect(`/admin/data/settings/developer/${CARRIER_CATALOG[0].slug}`);
}
