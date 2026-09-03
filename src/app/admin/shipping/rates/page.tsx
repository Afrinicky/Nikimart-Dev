import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ShippingRulesForm } from "@/components/admin/ShippingRulesForm";
import { prisma } from "@/lib/prisma";
import { describePoint } from "@/lib/shipping";
import { getConsolidationPoints, getShippingDefaults, getShippingRules } from "@/lib/shipping-config";

export const metadata: Metadata = { title: "Rates — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What the run inside Ghana costs.
 *
 * Retired consolidation points are still offered in the pickers, because a rule
 * may legitimately still refer to one while its last listings are collected;
 * hiding it would make the rule un-editable without explaining why.
 */
export default async function ShippingRatesPage() {
  const [rules, points, pickupPoints, categories, defaults] = await Promise.all([
    getShippingRules(),
    getConsolidationPoints(),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getShippingDefaults(),
  ]);

  return (
    <Container className="py-8">
      <h1 className="font-display text-xl font-bold text-niki-ink">Rates inside Ghana</h1>
      <p className="mt-1 max-w-2xl text-sm text-niki-ink/60">
        One seller&apos;s goods are gathered at a consolidation point, checked, and couriered to the
        station the buyer chose. This is what that one run costs.
      </p>

      <div className="mt-6">
        <ShippingRulesForm
          rules={rules}
          points={points.map((p) => ({
            id: p.id,
            label: p.isActive ? describePoint(p) : `${describePoint(p)} (retired)`,
          }))}
          pickupPoints={pickupPoints.map((p) => ({ id: p.id, label: `${p.name} — ${p.locationName}` }))}
          categories={categories.map((c) => ({ id: c.id, label: c.name }))}
          defaults={{
            baseFee: defaults.baseFee,
            perUnitFee: defaults.perUnitFee,
            minFee: defaults.minFee,
          }}
        />
      </div>
    </Container>
  );
}
