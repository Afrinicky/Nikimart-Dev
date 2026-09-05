import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ShippingLocationForm } from "@/components/admin/ShippingLocationForm";
import { prisma } from "@/lib/prisma";
import { getShippingLocation } from "@/lib/shipping-config";
import { updateShippingLocation } from "@/lib/shipping-location-actions";

export const metadata: Metadata = { title: "Edit location — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export default async function EditShippingLocationPage({ params }: { params: Params }) {
  const { key: raw } = await params;
  const key = decodeURIComponent(raw);
  const location = await getShippingLocation(key);
  if (!location || location.ownerName) notFound();

  // The two halves carry different fields, so both are read: the station knows
  // its hours and operator, the point knows its note.
  const [pickup, point, operators] = await Promise.all([
    location.pickupPointId
      ? prisma.pickupPoint.findUnique({ where: { id: location.pickupPointId } })
      : null,
    location.consolidationPointId
      ? prisma.arrivalPoint.findUnique({ where: { id: location.consolidationPointId } })
      : null,
    prisma.user.findMany({
      where: {
        role: { in: ["PICKUP", "ADMIN"] },
        OR: [{ pickupPoint: { is: null } }, { pickupPoint: { id: location.pickupPointId ?? "__none__" } }],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const action = updateShippingLocation.bind(null, key);

  return (
    <Container className="max-w-2xl py-8">
      <Link
        href="/admin/shipping/locations"
        className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to locations
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">Edit {location.name}</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <ShippingLocationForm
          action={action}
          operators={operators}
          submitLabel="Save changes"
          location={{
            name: location.name,
            code: location.code,
            where: location.where,
            address: pickup?.address ?? point?.address ?? "",
            openingHours: pickup?.openingHours ?? "",
            note: point?.note ?? "",
            operatorId: pickup?.operatorId ?? null,
            isPickup: location.isPickup,
            isConsolidation: location.isConsolidation,
            isActive: location.isActive,
          }}
        />
      </div>
    </Container>
  );
}
