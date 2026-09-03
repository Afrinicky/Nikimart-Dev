import Link from "next/link";
import type { Metadata } from "next";
import { Pencil, Plane, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { ImportSettingsForm } from "@/components/admin/ImportSettingsForm";
import { freightModeLabel } from "@/lib/abroad";
import { countryByCode } from "@/lib/countries";
import { getSettings } from "@/lib/settings";
import { getConsolidationPoints, getForwarders } from "@/lib/shipping-config";
import { deleteForwarder } from "@/lib/shipping-admin-actions";

export const metadata: Metadata = { title: "From abroad — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Goods coming into Ghana: who carries them, and on which lanes.
 *
 * Two arrangements, and only one of them needs anything on this screen. When a
 * supplier's price already reaches a Ghana consolidation point, there is
 * nothing to configure — the seller ticks a box on the listing and the local
 * system takes over. Forwarders are for the other case, and each of them holds
 * their own rate sheet: their classes of goods, their routes, and a price per
 * class per route. Open one to set it up.
 */
export default async function ShippingAbroadPage() {
  const [forwarders, points, settings] = await Promise.all([
    getForwarders(),
    getConsolidationPoints(),
    getSettings(),
  ]);

  const pointName = (id: string | null) => {
    const p = id ? points.find((x) => x.id === id) : null;
    return p ? `${p.name}${p.city ? `, ${p.city}` : ""}` : "";
  };

  return (
    <Container className="space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-niki-ink">From abroad</h1>
          <p className="mt-1 max-w-2xl text-sm text-niki-ink/60">
            When a supplier&apos;s price already reaches Ghana, nothing here applies — the seller
            ticks a box and the local rates take over from the consolidation point. Forwarders are
            for the other case: the supplier only reaches them, and they bring the load in. Each one
            keeps their own rate sheet — their classes of goods, their lanes, and a price for each.
          </p>
        </div>
        <Link
          href="/admin/shipping/abroad/new"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          New forwarder
        </Link>
      </div>

      {forwarders.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-niki-edge">
          <Plane className="mx-auto h-8 w-8 text-niki-ink/30" />
          <p className="mt-3 font-semibold text-niki-ink">No forwarders yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-niki-ink/60">
            Sellers can still list imported goods whose supplier delivers to Ghana. Anything else
            needs a forwarder with at least one priced route.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-5 py-3 font-semibold">Forwarder</th>
                <th className="px-5 py-3 font-semibold">Collects in</th>
                <th className="px-5 py-3 font-semibold">Delivers into</th>
                <th className="px-5 py-3 font-semibold">Quotes in</th>
                <th className="px-5 py-3 font-semibold">Their rate covers</th>
                <th className="px-5 py-3 font-semibold">Routes</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {forwarders.map((f) => {
                const country = countryByCode(f.originCountry);
                // A route that nobody has priced cannot carry anything, so
                // "3 routes" would be a comforting lie. Only priced ones count.
                const priced = f.routes.filter((r) => r.isActive && r.rates.length > 0).length;
                const legacy = f.routes.length === 0 && f.rates.length > 0;
                return (
                  <tr key={f.id} className={f.isActive ? "" : "opacity-55"}>
                    <td className="px-5 py-3 font-medium text-niki-ink">
                      {f.name}
                      <span className="block text-xs text-niki-ink/50">
                        {f.code} · {freightModeLabel(f.mode) || f.mode}
                        {f.isActive ? "" : " · retired"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-niki-ink/70">
                      {country ? `${country.flag} ${country.name}` : "Any country"}
                    </td>
                    <td className="px-5 py-3 text-niki-ink/70">
                      {pointName(f.consolidationPointId) || "Whatever the listing says"}
                    </td>
                    <td className="px-5 py-3 font-figures text-niki-ink/70">{f.currency}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          f.allInclusive
                            ? "bg-niki-success/10 text-niki-success"
                            : "bg-niki-gold/20 text-amber-900"
                        }`}
                      >
                        {f.allInclusive ? "Everything to Ghana" : "Carriage only"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          priced > 0
                            ? "bg-niki-black/5 text-niki-ink/70"
                            : legacy
                              ? "bg-niki-gold/20 text-amber-900"
                              : "bg-niki-danger/10 text-niki-danger"
                        }`}
                      >
                        {priced > 0
                          ? `${priced} priced`
                          : legacy
                            ? "On the old price list"
                            : "None — unquotable"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/shipping/abroad/${f.id}`}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Rate sheet
                        </Link>
                        <DeleteButton id={f.id} action={deleteForwarder} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ImportSettingsForm settings={settings as unknown as Record<string, string>} />
    </Container>
  );
}
