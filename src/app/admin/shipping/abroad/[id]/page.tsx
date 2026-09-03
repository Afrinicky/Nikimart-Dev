import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ForwarderForm } from "@/components/admin/ForwarderForm";
import { ForwarderClassesForm } from "@/components/admin/ForwarderClassesForm";
import { ForwarderRoutesForm } from "@/components/admin/ForwarderRoutesForm";
import { ForwarderRatesForm } from "@/components/admin/ForwarderRatesForm";
import { updateForwarder } from "@/lib/shipping-admin-actions";
import { prisma } from "@/lib/prisma";
import { describePoint, HOME_CURRENCY } from "@/lib/shipping";
import {
  getActiveConsolidationPoints,
  getActiveCurrencies,
  getCurrencies,
  getForwarders,
} from "@/lib/shipping-config";

export const metadata: Metadata = { title: "Edit forwarder — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/**
 * One forwarder's whole profile, in the order they are set up.
 *
 * Who they are, then their classes of goods, then our categories mapped onto
 * those, then the lanes they sell and what each costs. That order is not
 * cosmetic: a route price is *for* a class, and a class means nothing until our
 * categories sit in it, so working down the page once produces a forwarder who
 * can actually quote.
 *
 * Everything about the money now lives here rather than in a platform-wide
 * table, which is the point. A forwarder is a company with a rate sheet; the
 * system should hold one rate sheet per company, not one table that every
 * company has to be squeezed into.
 */
export default async function EditForwarderPage({ params }: { params: Params }) {
  const { id } = await params;
  const [forwarders, points, currencies, allCurrencies, categories] = await Promise.all([
    getForwarders(),
    getActiveConsolidationPoints(),
    getActiveCurrencies(),
    getCurrencies(),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const forwarder = forwarders.find((f) => f.id === id);
  if (!forwarder) notFound();

  const update = updateForwarder.bind(null, forwarder.id);
  const pointOptions = points.map((p) => ({ id: p.id, label: describePoint(p) }));
  const currencyOptions = currencies.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol }));
  const rateToGhs = Object.fromEntries(allCurrencies.map((c) => [c.code, c.rateToGhs]));
  const currencySymbol =
    allCurrencies.find((c) => c.code === (forwarder.currency || HOME_CURRENCY))?.symbol ||
    forwarder.currency;

  return (
    <Container className="max-w-4xl space-y-6 py-8">
      <div>
        <Link href="/admin/shipping/abroad" className="text-sm text-niki-ink/60 hover:text-niki-ink">
          ← All forwarders
        </Link>
        <h1 className="mt-3 font-display text-xl font-bold text-niki-ink">{forwarder.name}</h1>
        <p className="mt-1 text-sm text-niki-ink/60">
          Their classes of goods, the lanes they sell, and what each lane costs — set up the way
          their own quote sheet reads.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <ForwarderForm
          action={update}
          forwarder={forwarder}
          points={pointOptions}
          currencies={currencyOptions}
          submitLabel="Save forwarder"
        />
      </div>

      <ForwarderClassesForm
        forwarderId={forwarder.id}
        classes={forwarder.goodsClasses}
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        categoryMap={forwarder.categoryMap}
        currencySymbol={currencySymbol}
      />

      <ForwarderRoutesForm
        forwarderId={forwarder.id}
        routes={forwarder.routes}
        classes={forwarder.goodsClasses}
        points={pointOptions}
        currencies={currencyOptions}
        defaultCurrency={forwarder.currency || HOME_CURRENCY}
        rateToGhs={rateToGhs}
      />

      {/* The old flat list, shown only while it is still the thing pricing this
          forwarder. It keeps a pre-routes configuration quoting rather than
          breaking it, and disappears the moment a route takes over. */}
      {forwarder.routes.length === 0 && forwarder.rates.length > 0 ? (
        <ForwarderRatesForm
          forwarderId={forwarder.id}
          rates={forwarder.rates}
          categories={categories.map((c) => ({ id: c.id, label: c.name }))}
          allInclusive={forwarder.allInclusive}
        />
      ) : null}
    </Container>
  );
}
