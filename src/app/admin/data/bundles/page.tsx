import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { BundlePriceTable } from "@/components/admin/BundlePriceTable";
import { CostSyncTool, MarkupTool, NewBundleForm } from "@/components/admin/BundleTools";
import { getAllBundles, groupByNetwork } from "@/lib/data-bundles/catalog";
import { getAgentProgramConfig, getDataStoreConfig } from "@/lib/data-bundles/settings";
import { isProviderDashboardConfigured } from "@/lib/data-bundles/provider";

export const metadata: Metadata = { title: "Bundle Prices — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function AdminBundlePricesPage() {
  const [bundles, config, program] = await Promise.all([
    getAllBundles(),
    getDataStoreConfig(),
    getAgentProgramConfig(),
  ]);
  const groups = groupByNetwork(bundles);
  const syncable = isProviderDashboardConfigured();

  return (
    <Container className="py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-niki-ink">Bundle prices</h1>
        <p className="mt-1 text-sm text-niki-ink/60">
          Cost, agent price and selling price for every size. Margins are worked out as you type.
        </p>
      </div>

      {bundles.length === 0 ? (
        <p className="mt-6 flex items-start gap-3 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            No bundle rows yet. Run{" "}
            <code className="font-mono text-xs">nikimart-neon-data-bundles.sql</code> to create the
            tables and seed the starter ladder.
          </span>
        </p>
      ) : null}

      {/* Costs come from the provider now, daily and on demand. */}
      <div className="mt-6">
        <CostSyncTool
          syncedLabel={
            syncable
              ? "Fetched from the provider every day. Cost prices only — nothing else is touched."
              : "Set JUSTICE_AGENT_PHONE and JUSTICE_AGENT_PASSWORD to fetch costs automatically."
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <MarkupTool
          defaultMarkup={config.markupPercent}
          defaultAgentDiscount={program.agentDiscountPercent}
        />
        <NewBundleForm />
      </div>

      <div className="mt-6 space-y-6">
        {groups.map((g) => (
          <BundlePriceTable
            key={g.network}
            network={g.network}
            bundles={g.bundles.map((b) => ({
              id: b.id,
              sizeGb: b.sizeGb,
              price: b.price,
              costPrice: b.costPrice,
              agentPrice: b.agentPrice,
              teamCommission: b.teamCommission,
              isActive: b.isActive,
            }))}
          />
        ))}
      </div>
    </Container>
  );
}
