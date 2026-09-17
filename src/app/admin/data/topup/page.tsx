import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { AdminTopup, type AdminBundle } from "@/components/admin/AdminTopup";
import { requireAdmin } from "@/lib/session";
import { getActiveBundles } from "@/lib/data-bundles/catalog";

export const metadata: Metadata = { title: "Buy data — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Nickimart buying its own bundles at the rate it wholesales to agents.
 *
 * Only bundles with an agent price appear: a bundle that is not wholesaled has
 * no wholesale price to buy it at, and quietly falling back to retail would
 * mean the house paying its own markup.
 */
export default async function AdminTopupPage() {
  await requireAdmin();
  const bundles = await getActiveBundles();

  const rows: AdminBundle[] = bundles
    .filter((b) => b.agentPrice > 0)
    .map((b) => ({
      network: b.network,
      sizeGb: b.sizeGb,
      agentPrice: b.agentPrice,
      retailPrice: b.price,
      validity: b.validity,
    }));

  return (
    <Container className="py-8">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <ShoppingBag className="h-4.5 w-4.5" />
        </span>
        <div>
          <h1 className="font-figures text-2xl font-bold text-niki-ink">Buy data</h1>
          <p className="mt-0.5 text-sm text-niki-ink/60">
            At the wholesale rate you charge agents. Paid through Paystack and recorded as a house
            order.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <AdminTopup bundles={rows} />
      </div>
    </Container>
  );
}
