import Link from "next/link";
import type { Metadata } from "next";
import { Anchor, Pencil, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { prisma } from "@/lib/prisma";
import { deleteArrivalPoint } from "@/lib/arrival-point-actions";

export const metadata: Metadata = { title: "Ghana Arrival Points — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Where consignments from abroad land, and what that costs.
 *
 * This is the admin half of the shipped-from-abroad system: sellers pick from
 * this list when they list a product, and the point they pick sets the freight
 * rate into Ghana, the import duty, and where the domestic leg starts. With no
 * points configured, sellers can only list items whose price already covers
 * freight — which is worth saying on the page rather than leaving them to
 * discover in the product form.
 */
export default async function AdminArrivalPointsPage() {
  const points = await prisma.arrivalPoint.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      hubPickup: { select: { name: true } },
      _count: { select: { rates: true, products: true } },
    },
  });

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Ghana Arrival Points</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            {points.length} point{points.length === 1 ? "" : "s"} — where goods shipped from abroad
            clear before the domestic leg.
          </p>
        </div>
        <Link
          href="/admin/arrival-points/new"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          New arrival point
        </Link>
      </div>

      {points.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-niki-edge">
          <Anchor className="mx-auto h-8 w-8 text-niki-ink/30" />
          <p className="mt-3 font-semibold text-niki-ink">No arrival points yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-niki-ink/60">
            Until one exists, sellers can only list items shipped from abroad whose price already
            includes freight into Ghana — everything else has nowhere to land and can&apos;t be
            quoted.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Code</th>
                <th className="px-5 py-3 font-semibold">Domestic leg from</th>
                <th className="px-5 py-3 font-semibold">Duty</th>
                <th className="px-5 py-3 font-semibold">Clearing</th>
                <th className="px-5 py-3 font-semibold">Rates</th>
                <th className="px-5 py-3 font-semibold">Listings</th>
                <th className="px-5 py-3 font-semibold">Active</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {points.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3 font-medium text-niki-ink">
                    {p.name}
                    {p.city ? <span className="block text-xs text-niki-ink/50">{p.city}</span> : null}
                  </td>
                  <td className="px-5 py-3 text-niki-ink/60">{p.code}</td>
                  <td className="px-5 py-3 text-niki-ink/70">{p.hubPickup?.name ?? "Site default"}</td>
                  <td className="px-5 py-3 font-figures text-niki-ink/70">{p.dutyPercent}%</td>
                  <td className="px-5 py-3 font-figures text-niki-ink/70">
                    {p.clearingFee > 0 ? `GH₵${p.clearingFee.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        p._count.rates > 0
                          ? "bg-niki-success/10 text-niki-success"
                          : "bg-niki-danger/10 text-niki-danger"
                      }`}
                    >
                      {p._count.rates > 0 ? `${p._count.rates} configured` : "None — unquotable"}
                    </span>
                  </td>
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
                        href={`/admin/arrival-points/${p.id}`}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit &amp; rates
                      </Link>
                      <DeleteButton
                        id={p.id}
                        action={deleteArrivalPoint}
                        title={
                          p._count.products > 0
                            ? "In use by listings — will be retired, not deleted"
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
