import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ShippingBaseFeeGrid } from "@/components/admin/ShippingBaseFeeGrid";
import { LargeItemPolicyForm } from "@/components/admin/LargeItemPolicyForm";
import {
  getLargeItemPolicy,
  getShippingDefaults,
  getShippingLaneFees,
  getShippingLocations,
} from "@/lib/shipping-config";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Base fees — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What every run inside Ghana costs, in one table.
 *
 * There is no single base fee to set and there never was. Nikimart's Sunyani
 * pickup to Hwidiem, Accra to the Sunyani station, CSL's Sunyani depot to the
 * Nikimart station in the same town — three runs with three costs, and one
 * number in settings could only ever have been right for one of them.
 *
 * The rows and the columns are the same list of locations, drawn from the
 * database, so a station or a depot created this morning is priceable this
 * morning. It is also the only screen that prices a run: the rules table that
 * used to sit beside it is gone, because two tables that can disagree about one
 * journey is how a fee comes to depend on which screen was edited last.
 */
export default async function ShippingLanesPage() {
  const [locations, lanes, defaults, large, settings] = await Promise.all([
    getShippingLocations(),
    getShippingLaneFees(),
    getShippingDefaults(),
    getLargeItemPolicy(),
    getSettings(),
  ]);

  return (
    <Container className="space-y-6 py-8">
      <div>
        <h1 className="font-display text-xl font-bold text-niki-ink">Base fees</h1>
        <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
          Every run inside Ghana, from every location to every other one — ours and the
          forwarders&apos;. The first item is charged once for the load and each item after it adds
          the increment, so ten bottles from one shop are one van and one base fee. Every place on
          the{" "}
          <Link href="/admin/shipping/locations" className="font-medium underline">
            Locations
          </Link>{" "}
          screen is a row and a column here, automatically.
        </p>
      </div>

      <ShippingBaseFeeGrid
        locations={locations.map((l) => ({
          key: l.key,
          name: l.name,
          where: l.where,
          ownerName: l.ownerName,
          isConsolidation: l.isConsolidation,
          isPickup: l.isPickup,
          isActive: l.isActive,
        }))}
        lanes={lanes.map((l) => ({
          originKey: l.originKey,
          destKey: l.destKey,
          baseFee: l.baseFee,
          perUnitFee: l.perUnitFee,
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
