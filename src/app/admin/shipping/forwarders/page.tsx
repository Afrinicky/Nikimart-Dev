import Link from "next/link";
import type { Metadata } from "next";
import { Pencil, Plane, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { countryByCode } from "@/lib/countries";
import { freightModeLabel } from "@/lib/shipping";
import { getForwarders } from "@/lib/shipping-config";
import { deleteForwarder } from "@/lib/forwarder-actions";

export const metadata: Metadata = { title: "Forwarders — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Every freight forwarder, and whether they can actually carry anything.
 *
 * A forwarder is a company with a rate sheet, so one row is one company and the
 * whole sheet is one click away. The counts are the honest ones: a warehouse
 * with no priced lane cannot take goods, so it is not counted as though it can.
 */
export default async function ForwardersPage() {
  const forwarders = await getForwarders();

  return (
    <Container className="space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-niki-ink">Freight forwarders</h1>
          <p className="mt-1 max-w-2xl text-sm text-niki-ink/60">
            Each one collects abroad, consolidates, and brings goods to their own warehouses in
            Ghana. Their rate per cubic metre is the whole cost of that leg — nothing is added on
            top of it. International consolidation points are theirs and are created here.
          </p>
        </div>
        <Link
          href="/admin/shipping/forwarders/new"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          Add new forwarder
        </Link>
      </div>

      {forwarders.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-niki-edge">
          <Plane className="mx-auto h-8 w-8 text-niki-ink/30" />
          <p className="mt-3 font-semibold text-niki-ink">No forwarders yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-niki-ink/60">
            Sellers can still list imported goods whose supplier delivers to Ghana. Anything else
            needs a forwarder with a priced lane.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-5 py-3 font-semibold">Forwarder</th>
                <th className="px-5 py-3 font-semibold">Collects in</th>
                <th className="px-5 py-3 font-semibold">Consolidation points</th>
                <th className="px-5 py-3 font-semibold">Modes</th>
                <th className="px-5 py-3 font-semibold">Quotes in</th>
                <th className="px-5 py-3 font-semibold">Grid</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {forwarders.map((f) => {
                const country = countryByCode(f.originCountry);
                const modes = [...new Set(f.routes.filter((r) => r.isActive).map((r) => r.mode))];
                const priced = f.routes.filter(
                  (r) => r.isActive && r.rates.some((x) => x.isAvailable && x.ratePerCbm > 0),
                ).length;
                return (
                  <tr key={f.id} className={f.isActive ? "" : "opacity-55"}>
                    <td className="px-5 py-3 font-medium text-niki-ink">
                      {f.name}
                      <span className="block text-xs text-niki-ink/50">
                        {f.code}
                        {f.contactPhone ? ` · ${f.contactPhone}` : ""}
                        {f.isActive ? "" : " · inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-niki-ink/70">
                      {country ? `${country.flag} ${country.name}` : "—"}
                      {f.collectionCity ? (
                        <span className="block text-xs text-niki-ink/50">{f.collectionCity}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-niki-ink/70">
                      {f.consolidations.length === 0
                        ? "—"
                        : f.consolidations.map((p) => p.name).join(", ")}
                    </td>
                    <td className="px-5 py-3 text-niki-ink/70">
                      {modes.length === 0
                        ? "—"
                        : modes.map((m) => freightModeLabel(m) || m).join(", ")}
                    </td>
                    <td className="px-5 py-3 font-figures text-niki-ink/70">{f.currency}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          priced > 0
                            ? "bg-niki-success/10 text-niki-success"
                            : "bg-niki-danger/10 text-niki-danger"
                        }`}
                      >
                        {priced > 0
                          ? `${priced} priced lane${priced === 1 ? "" : "s"}`
                          : "No prices — unquotable"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/shipping/forwarders/${f.id}`}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                        <DeleteButton
                          id={f.id}
                          action={deleteForwarder}
                          title="Deletes the forwarder, their consolidation points, lanes and rates."
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
