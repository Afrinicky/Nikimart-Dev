import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import { getAffiliateCatalogue } from "@/lib/affiliate-catalogue";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Shops — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Nickimart's shops, ranked by what they pay an affiliate.
 *
 * Browsing by shop is how somebody promoting a category actually works — one
 * supplier's whole range at a consistent commission beats a scattered list.
 * So each shop leads with the figure that decides it: how many of its listings
 * earn, and the best per-sale commission among them.
 */
export default async function AffiliateShopsPage() {
  const { affiliate } = await requireAffiliateConsole();

  // One resolution of the whole catalogue, grouped here. The rate rules are
  // per product, so there is no shop-level query that could answer this.
  const { products } = await getAffiliateCatalogue(affiliate.id, {}, 1, 100_000);

  const shops = new Map<
    string,
    { name: string; slug: string; total: number; eligible: number; best: number; selected: number }
  >();
  for (const p of products) {
    const key = p.vendorId;
    const row =
      shops.get(key) ??
      { name: p.vendorName, slug: p.vendorSlug, total: 0, eligible: 0, best: 0, selected: 0 };
    row.total += 1;
    if (p.eligible) row.eligible += 1;
    if (p.selected) row.selected += 1;
    row.best = Math.max(row.best, p.earnPerSale);
    shops.set(key, row);
  }

  const rows = [...shops.values()].sort(
    (a, b) => b.eligible - a.eligible || b.best - a.best || a.name.localeCompare(b.name),
  );

  return (
    <div>
      <ModuleHeader
        title="Shops"
        subtitle="Every shop on Nickimart, and how much of its range earns you commission."
        icon={Store}
      >
        <Link
          href="/affiliate/shop"
          className="niki-press rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          All products
        </Link>
      </ModuleHeader>

      {rows.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-white px-4 py-14 text-center text-sm text-niki-ink/55 ring-1 ring-niki-edge">
          No shops are listing products yet.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((shop) => (
            <li key={shop.slug}>
              <Link
                href={`/affiliate/shop/shops/${shop.slug}`}
                className="niki-lift flex h-full flex-col rounded-2xl bg-white p-5 ring-1 ring-niki-edge transition-shadow hover:shadow-lg hover:shadow-niki-black/5"
              >
                <p className="font-display font-bold text-niki-ink">{shop.name}</p>
                <p className="mt-0.5 text-xs text-niki-ink/50">
                  {shop.total} {shop.total === 1 ? "listing" : "listings"}
                  {shop.selected > 0 ? ` · ${shop.selected} on your list` : ""}
                </p>
                <div className="mt-4 flex items-end justify-between gap-3 border-t border-niki-edge pt-3">
                  <span>
                    <span className="block font-figures text-lg font-bold text-niki-ink">
                      {shop.eligible}
                    </span>
                    <span className="block text-[11px] text-niki-ink/50">earn commission</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-figures text-lg font-bold text-niki-success">
                      {shop.best > 0 ? `+${formatPrice(shop.best)}` : "—"}
                    </span>
                    <span className="block text-[11px] text-niki-ink/50">best per sale</span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
