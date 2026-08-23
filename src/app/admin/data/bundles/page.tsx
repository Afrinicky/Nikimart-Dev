import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { BundlePriceTable } from "@/components/admin/BundlePriceTable";
import { MarkupTool, NewBundleForm } from "@/components/admin/BundleTools";
import { getAllBundles, groupByNetwork } from "@/lib/data-bundles/catalog";
import { getAgentProgramConfig, getDataStoreConfig } from "@/lib/settings";

export const metadata: Metadata = { title: "Bundle Prices — Admin — NikiMart" };
export const dynamic = "force-dynamic";

export default async function AdminBundlePricesPage() {
  const [bundles, config, program] = await Promise.all([
    getAllBundles(),
    getDataStoreConfig(),
    getAgentProgramConfig(),
  ]);
  const groups = groupByNetwork(bundles);

  return (
    <Container className="py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-niki-ink">Bundle prices</h1>
        <p className="mt-1 text-sm text-niki-ink/60">
          Three prices per size: what the provider charges you, what your sub-agents pay, and what
          a walk-in buyer pays. Both margins are worked out for you as you type.
        </p>
      </div>

      {bundles.length === 0 ? (
        <p className="mt-6 flex items-start gap-3 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            No bundle rows in the database yet. Run{" "}
            <code className="font-mono text-xs">nikimart-neon-data-bundles.sql</code> to create the
            tables and seed the starter price ladder — the storefront shows those starter prices in
            the meantime.
          </span>
        </p>
      ) : (
        <p className="mt-6 flex items-start gap-3 rounded-2xl bg-niki-surface px-5 py-4 text-sm text-niki-ink/70 ring-1 ring-black/5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-niki-orange" />
          <span>
            The seeded prices are placeholders. Check every row against your Justice Datashop agent
            cost before you advertise the store.
          </span>
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
              isActive: b.isActive,
            }))}
          />
        ))}
      </div>
    </Container>
  );
}
