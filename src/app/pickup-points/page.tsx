import type { Metadata } from "next";
import { Clock, MapPin, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Pickup Points — Nickimart",
};

/**
 * The public list of pickup points.
 *
 * These are the rows an admin manages under Admin → Pickup points, and the
 * same rows a buyer chooses between at checkout. They used to be nine names
 * hardcoded in lib/global-data, which is why editing a pickup point in the
 * admin console changed nothing here — the two lists had never been connected,
 * even though the save action was already revalidating this path.
 *
 * Only active points are listed: an inactive one cannot be chosen at checkout,
 * so advertising it sends people to a counter that will turn them away.
 */
export default async function PickupPointsPage() {
  const [points, settings] = await Promise.all([
    prisma.pickupPoint
      .findMany({
        where: { isActive: true },
        orderBy: [{ locationName: "asc" }, { name: "asc" }],
        select: { id: true, name: true, locationName: true, address: true, openingHours: true },
      })
      // The storefront should not 500 because this table is unreachable.
      .catch(() => []),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Pickup Points"
        subtitle="Collect your orders securely from a trusted Nickimart pickup point near you, using a one-time OTP."
        crumbs={[{ label: "Pickup points" }]}
      />

      <Container className="py-8">
        {points.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-6 w-6" />}
            title="No pickup points yet"
            message="We're setting up collection points across Ghana. Home delivery is available at checkout in the meantime."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {points.map((p) => (
              <div key={p.id} className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-black text-niki-orange">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-niki-ink">{p.name}</h3>
                    {p.locationName ? (
                      <p className="text-sm text-niki-ink/55">{p.locationName}</p>
                    ) : null}
                  </div>
                </div>
                {p.address ? (
                  <p className="mt-3 text-sm text-niki-ink/65">{p.address}</p>
                ) : null}
                <div className="mt-3 space-y-1.5 text-sm text-niki-ink/65">
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-niki-ink/40" />
                    {/* A point with no hours of its own keeps the site-wide
                        ones rather than showing a blank line. */}
                    {p.openingHours.trim() || settings.businessHours}
                  </p>
                  <p className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-niki-success" />
                    OTP-secured collection
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {settings.pickupPointsNote ? (
          <p className="mt-8 rounded-2xl bg-white p-4 text-sm text-niki-ink/65 ring-1 ring-niki-edge">
            {settings.pickupPointsNote}
          </p>
        ) : null}
      </Container>
    </>
  );
}
