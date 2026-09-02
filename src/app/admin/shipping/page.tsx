import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, MapPin, Plane, SlidersHorizontal } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ExportButton } from "@/components/admin/ExportButton";
import { ShippingDefaultsForm } from "@/components/admin/ShippingDefaultsForm";
import { describePoint } from "@/lib/shipping";
import { getConsolidationPoints, getShippingHealth } from "@/lib/shipping-config";
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
    getConsolidationPoints(),
    getSettings(),
  ]);

  const steps = [
    {
      done: health.points > 0,
      href: "/admin/shipping/points",
      icon: MapPin,
      title: "Create your consolidation points",
      body:
        health.points > 0
          ? `${health.points} point${health.points === 1 ? "" : "s"} — ${health.localPoints} local, ${health.internationalPoints} international. ${health.pointsAtPickup} sit${health.pointsAtPickup === 1 ? "s" : ""} at a pickup station, so collecting there is free.`
          : "Where goods are gathered and checked before a courier takes them to a buyer. Nothing else can be priced until these exist.",
    },
    {
      done: health.rules > 0,
      href: "/admin/shipping/rates",
      icon: SlidersHorizontal,
      title: "Price the run inside Ghana",
      body:
        health.rules > 0
          ? `${health.rules} rule${health.rules === 1 ? "" : "s"} on top of the defaults below.`
          : "Optional — the defaults below already price every route. Add a rule to fix a price for a route, a category, or both.",
    },
    {
      done: health.forwardersWithRates > 0,
      href: "/admin/shipping/abroad",
      icon: Plane,
      title: "Add the forwarders who bring goods in",
      body:
        health.forwarders > 0
          ? `${health.forwarders} forwarder${health.forwarders === 1 ? "" : "s"}, ${health.forwardersWithRates} with a price list.`
          : "Only needed for imports a supplier does not deliver to Ghana themselves.",
    },
  ];

  return (
    <Container className="space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-niki-ink/65">
          Every order is gathered at a consolidation point, checked, and couriered to the pickup
          station the buyer chose. Goods from abroad have one leg in front of that: either the
          supplier delivers them to Ghana, or a forwarder does. Buyers see the item price and one
          shipping figure; the duty and taxes live inside it.
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
            they can&apos;t be bought. Assign a forwarder on the listing, or set a fallback rate per
            CBM under <Link href="/admin/shipping/abroad" className="underline">From abroad</Link>.
          </span>
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
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
