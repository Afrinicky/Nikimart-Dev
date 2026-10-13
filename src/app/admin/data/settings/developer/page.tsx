import type { Metadata } from "next";
import { DeveloperSettingsForm } from "@/components/admin/DeveloperSettingsForm";
import { getMtnConfig, mtnEnvStatus } from "@/lib/data-bundles/mtn/config";
import { productRows, unmappedSizes } from "@/lib/data-bundles/mtn/products";
import { getAllBundles } from "@/lib/data-bundles/catalog";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Developer — Data Store Settings — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Developer settings: the fulfilment route, the product codes, and a read-only
 * view of the environment.
 *
 * Nothing secret reaches this page. `mtnEnvStatus` reports which variables are
 * set and never what they hold, so the props handed to the client component
 * contain no credential, masked or otherwise.
 */
export default async function AdminDataDeveloperSettingsPage() {
  const mtn = await getMtnConfig();

  // The product-code rows are the price ladder itself, so there is no list of
  // sizes maintained here that could fall behind the one being sold. `unmapped`
  // is the same data read as a warning: sizes on sale with no code, which would
  // quietly keep using the old route.
  let rows = productRows(mtn.products, []);
  let unmapped: number[] = [];
  try {
    const bundles = await getAllBundles();
    rows = productRows(mtn.products, bundles);
    unmapped = unmappedSizes(mtn.products, bundles);
  } catch {
    // The ladder is unreadable (not migrated, database briefly away). Falling
    // back to no rows keeps the rest of the page usable — and, importantly,
    // every stored code then shows as an orphan rather than appearing lost.
    rows = productRows(mtn.products, []);
  }

  const callbackUrl = new URL("/api/data-bundles/mtn/callback", siteUrl()).toString();

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-niki-ink/60">
        Integrations for the bundle business. Credentials live in the deployment&apos;s
        environment variables; what is editable here is the route and the product codes. Nothing
        on this page changes how an order is delivered until the fulfilment route is switched
        over.
      </p>
      <div className="mt-6">
        <DeveloperSettingsForm
          view={{
            route: mtn.routeEnabled ? "MTN" : "JUSTICE",
            routeReady: mtn.isReady,
            missing: mtn.missing,
            env: mtnEnvStatus(),
            ladder: rows.ladder,
            orphans: rows.orphans,
            productProblems: mtn.products.problems,
            unmapped,
            mappedCount: mtn.products.codes.size,
            callbackUrl,
          }}
        />
      </div>
    </div>
  );
}
