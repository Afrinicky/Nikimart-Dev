import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ConsolidationPointForm } from "@/components/admin/ConsolidationPointForm";
import { updateConsolidationPoint } from "@/lib/shipping-admin-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Edit consolidation point — Shipping — Admin" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EditConsolidationPointPage({ params }: { params: Params }) {
  const { id } = await params;
  const [point, pickupPoints] = await Promise.all([
    prisma.arrivalPoint.findUnique({ where: { id } }),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    }),
  ]);
  if (!point) notFound();

  const update = updateConsolidationPoint.bind(null, point.id);

  return (
    <Container className="max-w-2xl py-8">
      <Link href="/admin/shipping/points" className="text-sm text-niki-ink/60 hover:text-niki-ink">
        ← All points
      </Link>
      <h1 className="mt-3 font-display text-xl font-bold text-niki-ink">{point.name}</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <ConsolidationPointForm
          action={update}
          point={point}
          pickupPoints={pickupPoints}
          submitLabel="Save point"
        />
      </div>
    </Container>
  );
}
