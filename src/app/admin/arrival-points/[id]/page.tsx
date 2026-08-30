import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArrivalPointForm } from "@/components/admin/ArrivalPointForm";
import { ArrivalRatesForm } from "@/components/admin/ArrivalRatesForm";
import { updateArrivalPoint } from "@/lib/arrival-point-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Edit Arrival Point — Admin — Nickimart" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EditArrivalPointPage({ params }: { params: Params }) {
  const { id } = await params;
  const [point, pickupPoints] = await Promise.all([
    prisma.arrivalPoint.findUnique({
      where: { id },
      include: { rates: { orderBy: [{ originCountry: "asc" }, { mode: "asc" }] } },
    }),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    }),
  ]);
  if (!point) notFound();

  const update = updateArrivalPoint.bind(null, point.id);

  return (
    <>
      <PageHeader
        title={point.name}
        subtitle="Where consignments from abroad clear, and what each route into it costs."
        crumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Arrival points", href: "/admin/arrival-points" },
          { label: point.name },
        ]}
      />
      <Container className="space-y-6 py-8">
        <div className="max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <ArrivalPointForm action={update} point={point} pickupPoints={pickupPoints} submitLabel="Save point" />
        </div>

        <ArrivalRatesForm arrivalPointId={point.id} rates={point.rates} />
      </Container>
    </>
  );
}
