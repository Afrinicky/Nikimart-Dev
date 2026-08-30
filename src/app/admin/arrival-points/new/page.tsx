import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArrivalPointForm } from "@/components/admin/ArrivalPointForm";
import { createArrivalPoint } from "@/lib/arrival-point-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "New Arrival Point — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function NewArrivalPointPage() {
  const pickupPoints = await prisma.pickupPoint.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, locationName: true },
  });

  return (
    <>
      <PageHeader
        title="New arrival point"
        subtitle="Where consignments from abroad clear before the domestic leg."
        crumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Arrival points", href: "/admin/arrival-points" },
          { label: "New" },
        ]}
      />
      <Container className="py-8">
        <div className="max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <ArrivalPointForm
            action={createArrivalPoint}
            pickupPoints={pickupPoints}
            submitLabel="Create point"
          />
        </div>
        <p className="mt-4 max-w-2xl text-sm text-niki-ink/60">
          Freight rates are set once the point exists — save this first, then add a rate for each
          origin and mode it serves.
        </p>
      </Container>
    </>
  );
}
