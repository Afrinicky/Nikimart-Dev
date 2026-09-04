import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Coins, MapPin, Plane, SlidersHorizontal } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ExportButton } from "@/components/admin/ExportButton";
import { ShippingDefaultsForm } from "@/components/admin/ShippingDefaultsForm";
import { describePoint } from "@/lib/shipping";
import { getLocalConsolidationPoints, getShippingHealth } from "@/lib/shipping-config";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The shipping overview: is this configured, and what does it cost?
 *
 * The checklist is here because the failure it catches is silent. With no
 * consolidation points every listing prices from the platform defaults and no
 * collection is ever free — which looks like working software right up until a
 * buyer is charged to collect from the shelf their goods are sitting on.
 */
export default async function AdminShippingPage() {
  const [health, points, settings] = await Promise.all([
    getShippingHealth(),
    getLocalConsolidationPoints(),
    getSettings(),
  ]);

  const steps = [
    {
      done: health.localPoints > 0,
      href: "/admin/shipping/points",
      icon: MapPin,
      title: "Create your local points",
      body:
        health.localPoints > 0
          ? `${health.localPoints} of our own, and ${health.forwarderPoints} belonging to forwarders. ${health.pointsAtPickup} sit${health.pointsAtPickup === 1 ? "s" : ""} at a pickup station, so collecting there is free.`
          : "Where goods that never left Ghana are gathered and checked. A forwarder's own warehouses are created on their page, not here.",
    },
    {
      done: health.rules > 0,
      href: "/admin/shipping/rates",
      icon: SlidersHorizontal,
      title: "Price the run inside Ghana",
      body:
        health.rules > 0
          ? `${health.rules} rule${health.rules === 1 ? "" : "s"} on top of the defaults below.`
          : "This is also the run out of a forwarder's warehouse: Sunyani to a Hwidiem pickup station is a rule here.",
    },
    {
      done: health.forwardersWithRates > 0,
      href: "/admin/shipping/forwarders",
      icon: Plane,
      title: "Register the forwarders who bring goods in",
      body:
        health.forwarders > 0
          ? `${health.forwarders} forwarder${health.forwarders === 1 ? "" : "s"}, ${health.forwardersWithRates} with a priced grid, ${health.routes} lane${health.routes === 1 ? "" : "s"} in total.`
          : "Only needed for imports a supplier does not deliver to Ghana themselves. Each holds their own warehouses, classes of goods and rate grid.",
    },
    {
      done: health.unratedCurrencies.length === 0,
      href: "/admin/shipping/currencies",
      icon: Coins,
      title: "Keep the exchange rates current",
      body:
        health.unratedCurrencies.length > 0
          ? `${health.unratedCurrencies.join(", ")} still convert one-for-one, so freight quoted in ${health.unratedCurrencies.length === 1 ? "it" : "them"} is being charged at face value.`
          : "Forwarders quote in their own currency; buyers pay cedis. Correct a rate here and every lane priced in it moves with it.",
    },
  ];

  return (
    <Container className="space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-niki-ink/65">
          One seller&apos;s goods are one consignment: gathered at a consolidation point, checked,
          and couriered to the pickup station the buyer chose — a base fee once, plus a small
          increment for each extra item. Goods from abroad have one leg in front of that: either
          the supplier delivers them to Ghana, or a forwarder carries them to their own warehouse
          here and their rate per cubic metre is the whole cost of it.
        </p>
        <ExportButton dataset="shipping" />
      </div>

      {health.pickupPoints === 0 ? (
        <p className="flex items-start gap-2 rounded-2xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            There are no active pickup points, so nothing can be collected.{" "}
            <Link href="/admin/pickup-points" className="font-semibold underline">
              Add one first
            </Link>
            .
          </span>
        </p>
      ) : null}

      {health.unpricedListings > 0 ? (
        <p className="flex items-start gap-2 rounded-2xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {health.unpricedListings} imported listing{health.unpricedListings === 1 ? "" : "s"} name
            no forwarder and no supplier delivery, so freight into Ghana can&apos;t be quoted and
            they can&apos;t be bought. Assign a forwarder and a lane on the listing.
          </span>
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ done, href, icon: Icon, title, body }) => (
          <Link
            key={href}
            href={href}
            className="niki-lift group rounded-2xl bg-white p-5 ring-1 ring-niki-edge-strong transition-colors hover:ring-niki-orange/40"
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                done ? "bg-niki-success/10 text-niki-success" : "bg-niki-black text-niki-orange"
              }`}
            >
              {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
            </span>
            <h2 className="mt-3 flex items-center gap-1 font-semibold text-niki-ink">
              {title}
              <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
            </h2>
            <p className="mt-1 text-sm text-niki-ink/60">{body}</p>
          </Link>
        ))}
      </section>

      <ShippingDefaultsForm
        settings={settings as unknown as Record<string, string>}
        points={points
          .filter((p) => p.isActive)
          .map((p) => ({ id: p.id, label: describePoint(p) }))}
      />
    </Container>
  );
}
