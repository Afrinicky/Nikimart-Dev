import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ShippingRulesForm } from "@/components/admin/ShippingRulesForm";
import { prisma } from "@/lib/prisma";
import { describePoint } from "@/lib/shipping";
import {
  getConsolidationPoints,
  getForwarders,
  getShippingDefaults,
  getShippingRules,
} from "@/lib/shipping-config";

export const metadata: Metadata = { title: "Rates — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What the run inside Ghana costs — including the one out of a forwarder's
 * warehouse.
 *
 * The origin list holds both kinds of consolidation point on purpose. A
 * consignment that lands at a forwarder's Sunyani depot and is collected in
 * Hwidiem is one domestic run, priced by exactly the same rule as a seller's
 * Kumasi store to the same station. That is the link between the international
 * system and the local one, and it is a row on this screen.
 *
 * Retired points are still offered, because a rule may legitimately still refer
 * to one while its last listings are collected.
 */
export default async function ShippingRatesPage() {
  const [rules, points, forwarders, pickupPoints, categories, defaults] = await Promise.all([
    getShippingRules(),
    getConsolidationPoints(),
    getForwarders(),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getShippingDefaults(),
  ]);

  const forwarderName = new Map(forwarders.map((f) => [f.id, f.name]));

  return (
    <Container className="py-8">
      <h1 className="font-display text-xl font-bold text-niki-ink">Rates inside Ghana</h1>
      <p className="mt-1 max-w-2xl text-sm text-niki-ink/60">
        One consignment is gathered at a consolidation point, checked, and couriered to the station
        the buyer chose. This is what that one run costs — whether the point is ours or a
        forwarder&apos;s Ghana warehouse.
      </p>

      <div className="mt-6">
        <ShippingRulesForm
          rules={rules}
          points={points.map((p) => {
            const owner = p.forwarderId ? forwarderName.get(p.forwarderId) : "";
            const label = owner ? `${describePoint(p)} · ${owner}` : describePoint(p);
            return { id: p.id, label: p.isActive ? label : `${label} (retired)` };
          })}
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
