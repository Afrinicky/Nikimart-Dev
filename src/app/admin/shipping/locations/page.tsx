import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, PackageOpen, Pencil, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { ExportButton } from "@/components/admin/ExportButton";
import { prisma } from "@/lib/prisma";
import { getShippingLocations } from "@/lib/shipping-config";
import { deleteShippingLocation } from "@/lib/shipping-location-actions";

export const metadata: Metadata = { title: "Locations — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Every place goods pass through, in one list.
 *
 * There used to be two lists. Pickup points lived under Admin → Pickup and
 * consolidation points under Admin → Shipping, so the same building was typed
 * in twice under two names and the two screens disagreed about what existed.
 * Nothing downstream could be right after that: the grid drew its rows from one
 * list and its columns from the other, and a run between two places you could
 * see on the screen could not be priced.
 *
 * One list, and each row says what happens there. Both roles is the ordinary
 * case, and it is what makes collecting where the goods already sit free.
 */
export default async function ShippingLocationsPage() {
  const [locations, orderCounts] = await Promise.all([
    getShippingLocations(),
    prisma.order.groupBy({ by: ["pickupPointId"], _count: { _all: true } }),
  ]);

  const orders = new Map(orderCounts.map((o) => [o.pickupPointId ?? "", o._count._all]));

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-niki-ink">Locations</h1>
          <p className="mt-1 max-w-2xl text-sm text-niki-ink/60">
            Everywhere goods are collected from or gathered at. A place can be both — and usually
            is, which is what makes collecting where the goods already sit free. Every location here
            is a row and a column of the{" "}
            <Link href="/admin/shipping/lanes" className="font-medium underline">
              Base fees
            </Link>{" "}
            grid.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton dataset="pickup" />
          <Link
            href="/admin/shipping/locations/new"
            className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            <Plus className="h-4 w-4" />
            New location
          </Link>
        </div>
      </div>

      {locations.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-niki-edge">
          <MapPin className="mx-auto h-8 w-8 text-niki-ink/30" />
          <p className="mt-3 font-semibold text-niki-ink">No locations yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-niki-ink/60">
            Until one exists nothing can be collected and no run can be priced. Start with the
            station buyers collect from — it is usually where goods gather too.
          </p>
          <Link
            href="/admin/shipping/locations/new"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Create the first one
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-5 py-3 font-semibold">Location</th>
                <th className="px-5 py-3 font-semibold">What happens here</th>
                <th className="px-5 py-3 font-semibold">Belongs to</th>
                <th className="px-5 py-3 font-semibold">Orders</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {locations.map((l) => {
                const owned = Boolean(l.ownerName);
                return (
                  <tr key={l.key} className={l.isActive ? "" : "opacity-60"}>
                    <td className="px-5 py-3 font-medium text-niki-ink">
                      {l.name}
                      <span className="block text-xs font-normal text-niki-ink/50">
                        {l.where ? `${l.where} · ` : ""}
                        {l.code}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {l.isPickup ? (
                          <span className="flex items-center gap-1 rounded-full bg-niki-orange/10 px-2.5 py-1 text-xs font-semibold text-niki-orange">
                            <MapPin className="h-3 w-3" />
                            Buyers collect
                          </span>
                        ) : null}
                        {l.isConsolidation ? (
                          <span className="flex items-center gap-1 rounded-full bg-niki-black/5 px-2.5 py-1 text-xs font-semibold text-niki-ink/70">
                            <PackageOpen className="h-3 w-3" />
                            Goods gather
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-niki-ink/70">{l.ownerName || "Nikimart"}</td>
                    <td className="px-5 py-3 text-niki-ink/70">
                      {l.pickupPointId ? (orders.get(l.pickupPointId) ?? 0) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          l.isActive
                            ? "bg-niki-success/10 text-niki-success"
                            : "bg-niki-ink/10 text-niki-ink/60"
                        }`}
                      >
                        {l.isActive ? "Active" : "Retired"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {owned ? (
                        // A forwarder's warehouse belongs to them: it is created,
                        // edited and retired on their page, and appears here only
                        // so the grid's rows account for every place a run starts.
                        <p className="text-right text-xs text-niki-ink/45">
                          Managed on the forwarder&apos;s page
                        </p>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/shipping/locations/${encodeURIComponent(l.key)}`}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Link>
                          <DeleteButton
                            id={l.key}
                            action={deleteShippingLocation}
                            title={
                              l.pickupPointId && (orders.get(l.pickupPointId) ?? 0) > 0
                                ? "Has orders — will be retired rather than deleted"
                                : undefined
                            }
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
