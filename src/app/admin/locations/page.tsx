import Link from "next/link";
import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { getAllLocations } from "@/lib/locations";
import { deleteLocation } from "@/lib/location-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Locations — Admin — NikiMart" };

export default async function AdminLocationsPage() {
  const locations = await getAllLocations();
  // Distinguish DB-backed locations (deletable/editable) from built-in fallbacks.
  let dbIds = new Set<string>();
  try {
    dbIds = new Set((await prisma.location.findMany({ select: { id: true } })).map((l) => l.id));
  } catch {
    dbIds = new Set();
  }
  const seeded = dbIds.size > 0;

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Locations</h1>
          <p className="mt-1 text-sm text-niki-ink/60">Campuses, towns, and communities in the location picker.</p>
        </div>
        <Link
          href="/admin/locations/new"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          New location
        </Link>
      </div>

      {!seeded ? (
        <p className="mt-4 rounded-2xl bg-niki-gold/10 p-4 text-sm text-amber-800 ring-1 ring-niki-gold/30">
          Showing built-in default locations. Add a location to start managing them from the database.
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/50">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Type</th>
              <th className="px-5 py-3 font-semibold">Region</th>
              <th className="px-5 py-3 font-semibold">Active</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {locations.map((l) => {
              const editable = dbIds.has(l.id);
              return (
                <tr key={l.id}>
                  <td className="px-5 py-3 font-medium text-niki-ink">{l.name}</td>
                  <td className="px-5 py-3 text-niki-ink/70">{l.type}</td>
                  <td className="px-5 py-3 text-niki-ink/70">{l.region}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${l.isActive ? "bg-niki-success/10 text-niki-success" : "bg-niki-ink/10 text-niki-ink/60"}`}>
                      {l.isActive ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/locations/${l.id}`}
                        aria-disabled={!editable}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${editable ? "text-niki-ink/70 hover:bg-niki-navy/5" : "pointer-events-none text-niki-ink/30"}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <DeleteButton id={l.id} action={deleteLocation} disabled={!editable || l.id === "any"} title={!editable ? "Built-in — add via New to manage" : undefined} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
