import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ForwarderRegistrationForm } from "@/components/admin/ForwarderRegistrationForm";
import { prisma } from "@/lib/prisma";
import { getActiveCurrencies, getForwarders } from "@/lib/shipping-config";

export const metadata: Metadata = { title: "Edit forwarder — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/** The same one window the forwarder was registered in, prefilled. */
export default async function EditForwarderPage({ params }: { params: Params }) {
  const { id } = await params;
  const [forwarders, currencies, pickupPoints, categories] = await Promise.all([
    getForwarders(),
    getActiveCurrencies(),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const forwarder = forwarders.find((f) => f.id === id);
  if (!forwarder) notFound();

  return (
    <Container className="max-w-5xl space-y-6 py-8">
      <div>
        <Link href="/admin/shipping/forwarders" className="text-sm text-niki-ink/60 hover:text-niki-ink">
          ← All forwarders
        </Link>
        <h1 className="mt-3 font-display text-xl font-bold text-niki-ink">{forwarder.name}</h1>
        <p className="mt-1 text-sm text-niki-ink/60">
          Everything on this screen is what the forwarder is. Rows and columns you remove are
          removed when you save.
        </p>
      </div>

      <ForwarderRegistrationForm
        forwarder={forwarder}
        currencies={currencies.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol }))}
        pickupPoints={pickupPoints.map((p) => ({ id: p.id, label: `${p.name} — ${p.locationName}` }))}
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        submitLabel="Save forwarder"
      />
    </Container>
  );
}
