import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ForwarderRegistrationForm } from "@/components/admin/ForwarderRegistrationForm";
import { prisma } from "@/lib/prisma";
import { getActiveCurrencies, getCurrencies } from "@/lib/shipping-config";

export const metadata: Metadata = { title: "New forwarder — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Registering a forwarder: everything on one screen, saved in one go.
 *
 * It used to be a create form followed by three more screens, and the order
 * mattered — a price needs a class and a class needs a company — so anybody who
 * stopped halfway left a forwarder who could not quote.
 */
export default async function NewForwarderPage() {
  const [currencies, allCurrencies, pickupPoints, categories] = await Promise.all([
    getActiveCurrencies(),
    getCurrencies(),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <Container className="max-w-5xl space-y-6 py-8">
      <div>
        <Link href="/admin/shipping/forwarders" className="text-sm text-niki-ink/60 hover:text-niki-ink">
          ← All forwarders
        </Link>
        <h1 className="mt-3 font-display text-xl font-bold text-niki-ink">New freight forwarder</h1>
        <p className="mt-1 text-sm text-niki-ink/60">
          Their details, their warehouses in Ghana, and the rate grid for each one.
        </p>
      </div>

      <ForwarderRegistrationForm
        forwarder={null}
        currencies={currencies.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol }))}
        rateToGhs={Object.fromEntries(allCurrencies.map((c) => [c.code, c.rateToGhs]))}
        pickupPoints={pickupPoints.map((p) => ({ id: p.id, label: `${p.name} — ${p.locationName}` }))}
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        submitLabel="Create forwarder"
      />
    </Container>
  );
}
