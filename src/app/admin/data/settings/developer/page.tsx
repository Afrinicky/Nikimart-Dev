import type { Metadata } from "next";
import { DeveloperSettingsForm } from "@/components/admin/DeveloperSettingsForm";
import { getDataSettings } from "@/lib/data-bundles/settings";
import { getMtnConfig, mtnEnvStatus } from "@/lib/data-bundles/mtn/config";
import { unmappedSizes } from "@/lib/data-bundles/mtn/products";
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
  const [settings, mtn] = await Promise.all([getDataSettings(), getMtnConfig()]);

  // The gap worth seeing before the switch is thrown: sizes on sale that have
  // no MTN product code and would therefore quietly keep using the old route.
  let unmapped: number[] = [];
  try {
    const bundles = await getAllBundles();
    unmapped = unmappedSizes(mtn.products, bundles);
  } catch {
    // The ladder is unreadable (not migrated, database briefly away). The rest
    // of the page is still worth showing.
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
            productCodes: settings.mtnProductCodes,
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
