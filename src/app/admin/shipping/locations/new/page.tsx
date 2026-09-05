import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ShippingLocationForm } from "@/components/admin/ShippingLocationForm";
import { prisma } from "@/lib/prisma";
import { createShippingLocation } from "@/lib/shipping-location-actions";

export const metadata: Metadata = { title: "New location — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function NewShippingLocationPage() {
  // Only operators who don't already run a station: operatorId is unique.
  const operators = await prisma.user.findMany({
    where: { role: { in: ["PICKUP", "ADMIN"] }, pickupPoint: { is: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <Container className="max-w-2xl py-8">
      <Link
        href="/admin/shipping/locations"
        className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to locations
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">New location</h1>
      <p className="mt-1 text-sm text-niki-ink/60">
        It becomes a row and a column of the base-fee grid as soon as it is saved, priced by the
        platform defaults until you say otherwise.
      </p>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <ShippingLocationForm action={createShippingLocation} operators={operators} submitLabel="Create location" />
      </div>
    </Container>
  );
}
