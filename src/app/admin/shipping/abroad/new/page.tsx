import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ForwarderForm } from "@/components/admin/ForwarderForm";
import { createForwarder } from "@/lib/shipping-admin-actions";
import { describePoint } from "@/lib/shipping";
import { getActiveConsolidationPoints, getActiveCurrencies } from "@/lib/shipping-config";

export const metadata: Metadata = { title: "New forwarder — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function NewForwarderPage() {
  const [points, currencies] = await Promise.all([
    getActiveConsolidationPoints(),
    getActiveCurrencies(),
  ]);

  return (
    <Container className="max-w-2xl py-8">
      <Link href="/admin/shipping/abroad" className="text-sm text-niki-ink/60 hover:text-niki-ink">
        ← All forwarders
      </Link>
      <h1 className="mt-3 font-display text-xl font-bold text-niki-ink">New freight forwarder</h1>
      <p className="mt-1 text-sm text-niki-ink/60">
        Save this first. Their classes of goods, their routes and the price of each come next — a
        forwarder with no priced route can&apos;t carry anything.
      </p>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <ForwarderForm
          action={createForwarder}
          points={points.map((p) => ({ id: p.id, label: describePoint(p) }))}
          currencies={currencies.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol }))}
          submitLabel="Create forwarder"
        />
      </div>
    </Container>
  );
}
