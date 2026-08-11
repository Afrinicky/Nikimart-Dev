import Link from "next/link";
import { ShareButton } from "@/components/share/ShareButton";
import { CopyCatalogueButton } from "@/components/share/CopyCatalogueButton";
import { ProductImagePlaceholder } from "@/components/product/ProductImagePlaceholder";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

/**
 * The affiliate's promotable catalogue: products enrolled in the affiliate
 * program, each with a per-product referral link and share buttons, plus a
 * one-tap "copy my catalogue" for WhatsApp/social.
 */
export function AffiliatePromote({
  products,
  code,
  defaultRate,
  siteBase,
}: {
  products: Product[];
  code: string;
  defaultRate: number;
  siteBase: string;
}) {
  if (products.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-black/5">
        No products are in the affiliate program yet. Once sellers or the admin add products, they&apos;ll
        appear here for you to promote and earn on.
      </p>
    );
  }

  const catalogue = [
    "🛍️ Shop these on NikiMart:",
    "",
    ...products
      .slice(0, 30)
      .map((p) => `• ${p.name} — ${formatPrice(p.price)}\n${siteBase}/products/${p.slug}?ref=${code}`),
  ].join("\n");

  return (
    <div>
      <div className="mb-3">
        <CopyCatalogueButton text={catalogue} label="Copy my product catalogue" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {products.map((p) => {
          const rate = p.affiliateCommission ?? defaultRate;
          const path = `/products/${p.slug}?ref=${code}`;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-black/5">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt={p.name} className="h-full w-full bg-white object-cover" />
                ) : (
                  <ProductImagePlaceholder
                    gradientFrom={p.gradientFrom}
                    gradientTo={p.gradientTo}
                    emoji={p.emoji}
                    alt={p.name}
                    className="h-full w-full"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/products/${p.slug}`} className="line-clamp-1 text-sm font-semibold text-niki-ink hover:text-niki-orange">
                  {p.name}
                </Link>
                <div className="text-xs text-niki-ink/60">
                  {formatPrice(p.price)} · earn <span className="font-semibold text-niki-success">{rate}%</span>
                </div>
                <div className="mt-2">
                  <ShareButton path={path} title={`${p.name} on NikiMart`} label="Share & earn" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
