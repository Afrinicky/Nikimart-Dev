import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ConsolidationPointForm } from "@/components/admin/ConsolidationPointForm";
import { createConsolidationPoint } from "@/lib/shipping-admin-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "New consolidation point — Shipping — Admin" };
export const dynamic = "force-dynamic";

export default async function NewConsolidationPointPage() {
  const pickupPoints = await prisma.pickupPoint.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, locationName: true },
  });

  return (
    <Container className="max-w-2xl py-8">
      <h1 className="font-display text-xl font-bold text-niki-ink">New local consolidation point</h1>
      <p className="mt-1 text-sm text-niki-ink/60">
        Where goods that never left Ghana are gathered and checked before a courier takes them on.
        A forwarder&apos;s Ghana warehouse is created on their own registration page.
      </p>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <ConsolidationPointForm
          action={createConsolidationPoint}
          pickupPoints={pickupPoints}
          submitLabel="Create point"
        />
      </div>
    </Container>
  );
}
