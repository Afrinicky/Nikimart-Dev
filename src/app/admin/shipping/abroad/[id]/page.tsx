import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ForwarderForm } from "@/components/admin/ForwarderForm";
import { ForwarderRatesForm } from "@/components/admin/ForwarderRatesForm";
import { updateForwarder } from "@/lib/shipping-admin-actions";
import { prisma } from "@/lib/prisma";
import { describePoint } from "@/lib/shipping";
import { getActiveConsolidationPoints } from "@/lib/shipping-config";

export const metadata: Metadata = { title: "Edit forwarder — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EditForwarderPage({ params }: { params: Params }) {
  const { id } = await params;
  const [forwarder, points, categories] = await Promise.all([
    prisma.freightForwarder.findUnique({
      where: { id },
      include: { rates: { orderBy: [{ categoryId: "asc" }] } },
    }),
    getActiveConsolidationPoints(),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!forwarder) notFound();

  const update = updateForwarder.bind(null, forwarder.id);

  return (
    <Container className="max-w-3xl space-y-6 py-8">
      <div>
        <Link href="/admin/shipping/abroad" className="text-sm text-niki-ink/60 hover:text-niki-ink">
          ← All forwarders
        </Link>
        <h1 className="mt-3 font-display text-xl font-bold text-niki-ink">{forwarder.name}</h1>
      </div>

      <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <ForwarderForm
          action={update}
          forwarder={forwarder}
          points={points.map((p) => ({ id: p.id, label: describePoint(p) }))}
          submitLabel="Save forwarder"
        />
      </div>

      <ForwarderRatesForm
        forwarderId={forwarder.id}
        rates={forwarder.rates}
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        allInclusive={forwarder.allInclusive}
      />
    </Container>
  );
}
