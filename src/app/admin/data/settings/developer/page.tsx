import type { Metadata } from "next";
import { DeveloperSettingsForm } from "@/components/admin/DeveloperSettingsForm";
import { getDataSettings } from "@/lib/data-bundles/settings";
import { getMtnConfig } from "@/lib/data-bundles/mtn/config";
import { unmappedSizes } from "@/lib/data-bundles/mtn/products";
import { getAllBundles } from "@/lib/data-bundles/catalog";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Developer — Data Store Settings — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Developer settings: the API credentials and the fulfilment route.
 *
 * It reads the stored secrets only to report *whether* each is set — the
 * values themselves never leave the server, so there is nothing on this page
 * for a shared screen or a browser extension to pick up.
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
        Integrations and API credentials for the bundle business. Everything here is stored in
        this console — there is nothing to redeploy. Nothing on this page changes how an order is
        delivered until the fulfilment route below is switched over.
      </p>
      <div className="mt-6">
        <DeveloperSettingsForm
          view={{
            route: mtn.routeEnabled ? "MTN" : "JUSTICE",
            routeReady: mtn.isReady,
            missing: mtn.missing,
            hasClientSecret: Boolean(settings.mtnClientSecret),
            hasPin: Boolean(settings.mtnSenderPin),
            values: {
              mtnApiBase: settings.mtnApiBase,
              mtnClientId: settings.mtnClientId,
              mtnSenderMsisdn: settings.mtnSenderMsisdn,
              mtnTargetSystem: settings.mtnTargetSystem,
              mtnOriginChannelId: settings.mtnOriginChannelId,
              mtnCountryCode: settings.mtnCountryCode,
              mtnNetworkParam: settings.mtnNetworkParam,
              mtnTransferType: settings.mtnTransferType,
              mtnMsisdnFormat: settings.mtnMsisdnFormat,
              mtnAgentId: settings.mtnAgentId,
              mtnCallbackEnabled: settings.mtnCallbackEnabled,
              mtnProductCodes: settings.mtnProductCodes,
            },
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
