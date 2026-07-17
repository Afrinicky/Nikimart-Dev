import Link from "next/link";
import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { prisma } from "@/lib/prisma";
import { deletePickupPoint } from "@/lib/pickup-actions";

export const metadata: Metadata = { title: "Pickup Points — Admin — NikiMart" };

export default async function AdminPickupPointsPage() {
  const points = await prisma.pickupPoint.findMany({
    orderBy: { name: "asc" },
    include: { operator: true, _count: { select: { orders: true } } },
  });

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Pickup Points</h1>
          <p className="mt-1 text-sm text-niki-ink/60">{points.length} points</p>
        </div>
        <Link
          href="/admin/pickup-points/new"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          New pickup point
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/50">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Code</th>
              <th className="px-5 py-3 font-semibold">Operator</th>
              <th className="px-5 py-3 font-semibold">Orders</th>
              <th className="px-5 py-3 font-semibold">Active</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {points.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3 font-medium text-niki-ink">{p.name}</td>
                <td className="px-5 py-3 text-niki-ink/60">{p.code}</td>
                <td className="px-5 py-3 text-niki-ink/70">{p.operator?.name ?? p.operator?.email ?? "—"}</td>
                <td className="px-5 py-3 text-niki-ink/70">{p._count.orders}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.isActive ? "bg-niki-success/10 text-niki-success" : "bg-niki-ink/10 text-niki-ink/60"}`}>
                    {p.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/admin/pickup-points/${p.id}`} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-navy/5">
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Link>
                    <DeleteButton id={p.id} action={deletePickupPoint} title={p._count.orders > 0 ? "Has orders — will be deactivated" : undefined} />
                  </div>
                </td>
              </tr>
            ))}
            {points.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-niki-ink/50">No pickup points yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
