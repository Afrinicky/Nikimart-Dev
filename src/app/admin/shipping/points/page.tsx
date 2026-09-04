import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, Pencil, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { prisma } from "@/lib/prisma";
import { deleteConsolidationPoint } from "@/lib/shipping-admin-actions";

export const metadata: Metadata = { title: "Local points — Shipping — Admin" };
export const dynamic = "force-dynamic";

/**
 * NikiMart's own consolidation points.
 *
 * International points are not here any more. A forwarder's warehouse in Ghana
 * belongs to that forwarder — no other forwarder or seller may consolidate
 * there — so it is created and edited on their registration page and listed
 * under Forwarders. Keeping both kinds in one list is what let a seller pick a
 * landing point nobody was carrying goods to.
 *
 * The column that matters most here is "Sits at", because a point at a pickup
 * station is what makes collecting there free.
 */
export default async function ConsolidationPointsPage() {
  const points = await prisma.arrivalPoint.findMany({
    where: { forwarderId: null },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      hubPickup: { select: { name: true } },
      _count: { select: { products: true, rulesFrom: true } },
    },
  });

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-niki-ink">Local consolidation points</h1>
          <p className="mt-1 max-w-2xl text-sm text-niki-ink/60">
            Where goods that never left Ghana are gathered and checked before a courier takes them
            to a buyer&apos;s station. A point that sits at a pickup station makes collection there
            free. Forwarders&apos; own warehouses live on the Forwarders screen.
          </p>
        </div>
        <Link
          href="/admin/shipping/points/new"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          New point
        </Link>
      </div>

      {points.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-niki-edge">
          <MapPin className="mx-auto h-8 w-8 text-niki-ink/30" />
          <p className="mt-3 font-semibold text-niki-ink">No local points yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-niki-ink/60">
            Until one exists, every domestic listing prices from the platform defaults and no
            collection is ever free — a buyer would be charged to collect from the shelf their
            goods sit on.
          </p>
          <Link
            href="/admin/shipping/points/new"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Create the first one
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-5 py-3 font-semibold">Point</th>
                <th className="px-5 py-3 font-semibold">Sits at</th>
                <th className="px-5 py-3 font-semibold">Rules</th>
                <th className="px-5 py-3 font-semibold">Listings</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {points.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3 font-medium text-niki-ink">
                    {p.name}
                    <span className="block text-xs text-niki-ink/50">
                      {p.city ? `${p.city} · ` : ""}
                      {p.code}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-niki-ink/70">
                    {p.hubPickup ? (
                      <span className="font-medium text-niki-success">{p.hubPickup.name}</span>
                    ) : (
                      <span className="text-niki-ink/40">Not a pickup station</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-niki-ink/70">{p._count.rulesFrom}</td>
                  <td className="px-5 py-3 text-niki-ink/70">{p._count.products}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        p.isActive ? "bg-niki-success/10 text-niki-success" : "bg-niki-ink/10 text-niki-ink/60"
                      }`}
                    >
                      {p.isActive ? "Active" : "Retired"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/shipping/points/${p.id}`}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <DeleteButton
                        id={p.id}
                        action={deleteConsolidationPoint}
                        title={
                          p._count.products > 0
                            ? "Listings here will be left without a point until their seller picks another."
                            : undefined
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
