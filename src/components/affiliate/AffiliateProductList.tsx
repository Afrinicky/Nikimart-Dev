"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, PackageSearch, Search } from "lucide-react";
import { ShareMenu } from "@/components/share/ShareMenu";
import { formatPrice } from "@/lib/format";
import type { PromotableProduct } from "@/lib/affiliate";

/**
 * The affiliate's shareable catalogue: every product currently enrolled in the
 * programme, what they earn on each, and a one-tap share for every channel.
 *
 * Each link is the product page carrying the affiliate's code (`?ref=CODE`).
 * The code is stored in a 30-day cookie when the buyer lands, so the commission
 * follows through to checkout even if they browse around first.
 */
export function AffiliateProductList({
  products,
  code,
  suspended,
}: {
  products: PromotableProduct[];
  code: string;
  suspended: boolean;
}) {
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q) ||
        p.vendorName.toLowerCase().includes(q),
    );
  }, [products, query]);

  async function copy(product: PromotableProduct) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${refPath(product.slug, code)}`);
      setCopiedId(product.id);
      setTimeout(() => setCopiedId((id) => (id === product.id ? null : id)), 1600);
    } catch {
      // clipboard unavailable — the share sheet still offers every channel
    }
  }

  if (products.length === 0) {
    return (
      <div className="mt-4 rounded-2xl bg-white p-8 text-center ring-1 ring-black/5">
        <PackageSearch className="mx-auto h-8 w-8 text-niki-ink/30" />
        <p className="mt-3 font-semibold text-niki-ink">No products in the programme yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-niki-ink/60">
          Sellers choose which of their products to offer to affiliates, and NikiMart enrols some
          itself. Check back shortly — this list updates the moment a product is enrolled.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <label className="relative block max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-niki-ink/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products, shops, categories…"
          aria-label="Search promotable products"
          className="w-full rounded-full bg-white py-2.5 pl-10 pr-4 text-sm text-niki-ink ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-niki-orange"
        />
      </label>

      {suspended ? (
        <p className="mt-4 rounded-xl bg-niki-gold/10 px-4 py-3 text-sm text-amber-800 ring-1 ring-niki-gold/30">
          Your account is suspended, so these links won&apos;t earn commission until it&apos;s
          reactivated.
        </p>
      ) : null}

      <p className="mt-4 text-sm text-niki-ink/60">
        {filtered.length} {filtered.length === 1 ? "product" : "products"} available to promote
      </p>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <li key={p.id} className="flex flex-col rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-niki-surface text-xl">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden>{p.emoji}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${p.slug}`}
                  className="line-clamp-2 font-semibold text-niki-ink hover:text-niki-orange"
                >
                  {p.name}
                </Link>
                <p className="mt-0.5 truncate text-xs text-niki-ink/50">
                  {p.vendorName} · {p.categoryName}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-black/5 pt-3">
              <span className="text-sm text-niki-ink/60">{formatPrice(p.price)}</span>
              <span className="text-right">
                <span className="font-display font-bold text-niki-success">
                  +{formatPrice(p.earnPerSale)}
                </span>
                <span className="ml-1 text-xs text-niki-ink/50">({p.rate}%)</span>
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => copy(p)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-niki-ink/70 ring-1 ring-black/10 transition-colors hover:bg-niki-surface"
              >
                {copiedId === p.id ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-niki-success" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy link
                  </>
                )}
              </button>
              <ShareMenu
                path={refPath(p.slug, code)}
                title={`${p.name} on NikiMart`}
                label="Share"
                size="sm"
              />
            </div>
          </li>
        ))}
      </ul>

      {filtered.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-white p-6 text-center text-sm text-niki-ink/60 ring-1 ring-black/5">
          Nothing matches “{query}”.
        </p>
      ) : null}
    </div>
  );
}

/** The product page carrying this affiliate's referral code. */
function refPath(slug: string, code: string): string {
  return `/products/${slug}?ref=${encodeURIComponent(code)}`;
}
