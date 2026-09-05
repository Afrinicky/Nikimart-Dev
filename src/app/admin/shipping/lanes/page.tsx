import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ShippingBaseFeeGrid } from "@/components/admin/ShippingBaseFeeGrid";
import { LargeItemPolicyForm } from "@/components/admin/LargeItemPolicyForm";
import { prisma } from "@/lib/prisma";
import { describePoint } from "@/lib/shipping";
import {
  getConsolidationPoints,
  getForwarders,
  getLargeItemPolicy,
  getShippingDefaults,
  getShippingLaneFees,
} from "@/lib/shipping-config";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Base fees — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The base fee, one cell per journey.
 *
 * There is no single base fee to set. Nikimart's Sunyani pickup to Hwidiem,
 * Accra to the Sunyani station, CSL's Sunyani consolidation point to the
 * Nikimart station in the same town — three runs with three costs, and one
 * number in settings could only ever have been right for one of them.
 *
 * Both kinds of consolidation point are rows here, ours and the forwarders',
 * for the same reason they are both origins on the rules screen: a consignment
 * that lands at a forwarder's depot and is collected in Hwidiem is one domestic
 * run, and it is priced in the same table as a seller's shop to the same
 * station.
 */
export default async function ShippingLanesPage() {
  const [points, forwarders, stations, lanes, defaults, large, settings] = await Promise.all([
    getConsolidationPoints(),
    getForwarders(),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    }),
    getShippingLaneFees(),
    getShippingDefaults(),
    getLargeItemPolicy(),
    getSettings(),
  ]);

  const forwarderName = new Map(forwarders.map((f) => [f.id, f.name]));

  // A station that gathers goods as well as handing them over — Nikimart's own
  // Sunyani pickup, say — is a consolidation point sitting at that station, and
  // that is what puts it down the side of the grid as an origin. A station with
  // no point at it can only ever be a destination, which is worth saying here
  // rather than leaving somebody to wonder why their pickup is not a row.
  const stationsWithoutPoint = stations.filter(
    (s) => !points.some((p) => p.pickupPointId === s.id),
  );

  return (
    <Container className="space-y-6 py-8">
      <div>
        <h1 className="font-display text-xl font-bold text-niki-ink">Base fees</h1>
        <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
          What the first item costs on each run inside Ghana — from every consolidation point, ours
          and the forwarders&apos;, to every station a buyer collects at. The fee is charged once
          per seller: ten bottles from one shop are one van and one base fee. What each item after
          the first adds is set on the{" "}
          <Link href="/admin/shipping/rates" className="font-medium underline">
            Inside Ghana
          </Link>{" "}
          screen and is untouched by this one.
        </p>
      </div>

      {stationsWithoutPoint.length > 0 ? (
        <p className="rounded-2xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/70 ring-1 ring-niki-edge">
          {stationsWithoutPoint.map((s) => s.name).join(", ")}{" "}
          {stationsWithoutPoint.length === 1 ? "is a station goods" : "are stations goods"} can be
          collected at but not sent <em>from</em>. If a run starts there — Nikimart&apos;s own
          Sunyani pickup to Hwidiem, for instance — give it a consolidation point on the{" "}
          <Link href="/admin/shipping/points" className="font-medium underline">
            Local points
          </Link>{" "}
          screen and set that point&apos;s station to itself. It becomes a row here, and collecting
          at its own station stays free.
        </p>
      ) : null}

      <ShippingBaseFeeGrid
        origins={points.map((p) => ({
          id: p.id,
          label: describePoint(p),
          owner: p.forwarderId ? (forwarderName.get(p.forwarderId) ?? "A forwarder") : "",
          atPickupId: p.pickupPointId,
          isActive: p.isActive,
        }))}
        stations={stations.map((s) => ({ id: s.id, label: `${s.name} — ${s.locationName}` }))}
        lanes={lanes.map((l) => ({
          originPointId: l.originPointId,
          destPickupId: l.destPickupId,
          baseFee: l.baseFee,
          largeRatePerCbm: l.largeRatePerCbm,
          largeMinFee: l.largeMinFee,
          isActive: l.isActive,
        }))}
        defaults={{
          baseFee: defaults.baseFee,
          perUnitFee: defaults.perUnitFee,
          minFee: defaults.minFee,
        }}
        large={{
          enabled: large.enabled,
          ratePerCbm: large.ratePerCbm,
          extraPercent: large.extraPercent,
        }}
      />

      <LargeItemPolicyForm settings={settings as unknown as Record<string, string>} />
    </Container>
  );
}
