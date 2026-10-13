import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CarrierSettingsForm, type CarrierSettingsView } from "@/components/admin/CarrierSettingsForm";
import {
  getDataSettings,
  productCodesSettingKey,
  routeSettingKey,
} from "@/lib/data-bundles/settings";
import { NETWORK_INFO } from "@/lib/data-bundles/networks";
import { carrierById } from "@/lib/data-bundles/carriers/registry";
import { carrierCatalogBySlug, normaliseRoute } from "@/lib/data-bundles/carriers/rules";
import { parseProductMapping, productRows, unmappedSizes } from "@/lib/data-bundles/carriers/products";
import { getAllBundles, type Bundle } from "@/lib/data-bundles/catalog";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ carrier: string }>;
}): Promise<Metadata> {
  const { carrier } = await params;
  const entry = carrierCatalogBySlug(carrier);
  return { title: `${entry?.label ?? "Carrier"} — Developer — Admin — Nickimart` };
}

/**
 * One carrier's setup: how its networks are fulfilled, the product codes
 * behind that, and a read-only view of its environment.
 *
 * Every row is derived — the networks from the carrier catalogue, the bundle
 * sizes from the price ladder, the variables from the adapter. Nothing here is
 * a list that could fall behind the thing it describes.
 *
 * A carrier with no adapter yet gets a short placeholder instead. It is not a
 * stub to fill in later: the full page below appears on its own the moment an
 * adapter is registered, because everything it renders is read from that
 * adapter rather than written per carrier.
 *
 * Nothing secret reaches the browser. The adapter reports which variables are
 * set and never what they hold.
 */
export default async function CarrierDeveloperPage({
  params,
}: {
  params: Promise<{ carrier: string }>;
}) {
  const { carrier } = await params;
  const entry = carrierCatalogBySlug(carrier);
  if (!entry) notFound();

  const adapter = carrierById(entry.id);
  const networkLabels = entry.networks.map((n) => NETWORK_INFO[n].label).join(" and ");

  if (!adapter) {
    return (
      <div className="max-w-3xl">
        <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <h2 className="font-display text-lg font-bold text-niki-ink">{entry.label}</h2>
          <p className="mt-2 text-sm text-niki-ink/60">
            No direct {entry.label} integration yet. {networkLabels} bundles are delivered by the
            current provider, exactly as they always have been.
          </p>
          <p className="mt-3 text-sm text-niki-ink/60">
            When the {entry.label} API is connected, this page gains its own route switch, product
            codes and environment panel — the same as MTN&apos;s — without anything else in the
            store changing.
          </p>
        </section>
      </div>
    );
  }

  const settings = (await getDataSettings()) as unknown as Record<string, string>;
  const { ready, missing } = adapter.readiness();

  let bundles: Bundle[] = [];
  try {
    bundles = await getAllBundles();
  } catch {
    // The ladder is unreadable (not migrated, database briefly away). The page
    // is still worth showing: every stored code then appears as an orphan
    // rather than appearing lost.
  }

  const view: CarrierSettingsView = {
    id: entry.id,
    label: entry.label,
    productLabel: entry.productLabel,
    ready,
    missing,
    usesProductCodes: adapter.usesProductCodes,
    env: adapter.envVars(),
    hasTest: typeof adapter.test === "function",
    callbackUrl: new URL(
      `/api/data-bundles/${entry.slug}/callback`,
      siteUrl(),
    ).toString(),
    networks: entry.networks.map((network) => {
      // The pre-multi-network key is read only when the current one is empty,
      // so codes typed before the other carriers existed are not lost.
      const raw =
        settings[productCodesSettingKey(network)] ||
        (network === "MTN" ? settings.mtnProductCodes : "") ||
        "";
      const mapping = parseProductMapping(raw);
      const rows = productRows(mapping, bundles, network);

      return {
        network,
        label: NETWORK_INFO[network].label,
        live: normaliseRoute(settings[routeSettingKey(network)]) === entry.id,
        ladder: rows.ladder,
        orphans: rows.orphans,
        productProblems: mapping.problems,
        unmapped: unmappedSizes(mapping, bundles, network),
        mappedCount: mapping.codes.size,
      };
    }),
  };

  return (
    <div className="max-w-3xl">
      <CarrierSettingsForm view={view} />
    </div>
  );
}
