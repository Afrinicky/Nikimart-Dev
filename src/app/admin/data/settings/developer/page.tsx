import type { Metadata } from "next";
import {
  DeveloperSettingsForm,
  type CarrierView,
  type NetworkView,
} from "@/components/admin/DeveloperSettingsForm";
import { getDataSettings, productCodesSettingKey, routeSettingKey } from "@/lib/data-bundles/settings";
import { NETWORK_INFO, NETWORKS } from "@/lib/data-bundles/networks";
import { CARRIERS, carrierForNetwork } from "@/lib/data-bundles/carriers/registry";
import { normaliseRoute } from "@/lib/data-bundles/carriers/rules";
import {
  parseProductMapping,
  productRows,
  unmappedSizes,
} from "@/lib/data-bundles/carriers/products";
import { getAllBundles, type Bundle } from "@/lib/data-bundles/catalog";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Developer — Data Store Settings — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Developer settings: how each network is fulfilled, the product codes behind
 * it, and a read-only view of the environment.
 *
 * Every row is derived — the networks from the network list, their carriers
 * from the registry, their bundle sizes from the price ladder. Nothing here is
 * a list that could fall behind the thing it describes, which is what makes a
 * new carrier a one-line registry change rather than an edit to this page.
 *
 * Nothing secret reaches the browser. The adapters report which variables are
 * set and never what they hold, so the props handed to the client component
 * contain no credential, masked or otherwise.
 */
export default async function AdminDataDeveloperSettingsPage() {
  const settings = (await getDataSettings()) as unknown as Record<string, string>;

  let bundles: Bundle[] = [];
  try {
    bundles = await getAllBundles();
  } catch {
    // The ladder is unreadable (not migrated, database briefly away). The page
    // is still worth showing: every stored code then appears as an orphan
    // rather than appearing lost.
  }

  const networks: NetworkView[] = NETWORKS.map((network) => {
    const adapter = carrierForNetwork(network);
    const { ready, missing } = adapter?.readiness() ?? { ready: false, missing: [] };

    // The pre-multi-network key is read only when the current one is empty, so
    // codes typed before the other networks existed are not silently lost.
    const raw =
      settings[productCodesSettingKey(network)] ||
      (network === "MTN" ? settings.mtnProductCodes : "") ||
      "";
    const mapping = parseProductMapping(raw);
    const rows = productRows(mapping, bundles, network);

    return {
      network,
      label: NETWORK_INFO[network].label,
      carrierId: adapter?.id ?? null,
      carrierLabel: adapter?.label ?? null,
      live: adapter ? normaliseRoute(settings[routeSettingKey(network)]) === adapter.id : false,
      ready,
      missing,
      usesProductCodes: adapter?.usesProductCodes ?? false,
      ladder: rows.ladder,
      orphans: rows.orphans,
      productProblems: mapping.problems,
      unmapped: unmappedSizes(mapping, bundles, network),
      mappedCount: mapping.codes.size,
    };
  });

  const carriers: CarrierView[] = CARRIERS.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    env: adapter.envVars(),
    hasTest: typeof adapter.test === "function",
    callbackUrl: new URL(
      `/api/data-bundles/${adapter.id.toLowerCase()}/callback`,
      siteUrl(),
    ).toString(),
  }));

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-niki-ink/60">
        Integrations for the bundle business. Credentials live in the deployment&apos;s
        environment variables; what is editable here is each network&apos;s route and its product
        codes. Nothing on this page changes how an order is delivered until a route is switched
        over.
      </p>
      <div className="mt-6">
        <DeveloperSettingsForm view={{ networks, carriers }} />
      </div>
    </div>
  );
}
