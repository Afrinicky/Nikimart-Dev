import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Image as ImageIcon, Store } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { ConsolePill } from "@/components/affiliate/ConsoleTable";
import { CatalogueRowActions } from "@/components/affiliate/CatalogueRowActions";
import { CatalogueCard } from "@/components/affiliate/CatalogueCard";
import { prisma } from "@/lib/prisma";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import { getAffiliateCatalogue, getCatalogueProduct } from "@/lib/affiliate-catalogue";
import { discountPercent, formatMoney, formatPrice } from "@/lib/format";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await prisma.product
    .findUnique({ where: { slug }, select: { name: true } })
    .catch(() => null);
  return { title: `${product?.name ?? "Product"} — Affiliate — Nickimart` };
}

const RULE_LABELS: Record<string, string> = {
  product: "set on this product",
  category: "its category's rate",
  affiliate: "your agreed rate",
  default: "the programme default",
};

/**
 * One product, seen as an affiliate.
 *
 * The listing as a shopper sees it — photographs, description, price, stock —
 * with the affiliate's own question answered above the fold: does this pay,
 * how much, who funds it, and what have I already made from it. Everything an
 * affiliate can do to a product is on this page, so there is never a reason to
 * go and find it again somewhere else.
 */
export default async function AffiliateProductViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const { slug } = await params;

  const [resolved, listing] = await Promise.all([
    getCatalogueProduct(affiliate.id, slug),
    prisma.product
      .findUnique({
        where: { slug },
        select: {
          id: true,
          description: true,
          stockQuantity: true,
          productType: true,
          moq: true,
          rating: true,
          reviewCount: true,
          images: { orderBy: { order: "asc" }, select: { url: true } },
          vendor: { select: { businessName: true, slug: true } },
          category: { select: { name: true, slug: true } },
        },
      })
      .catch(() => null),
  ]);
  if (!resolved || !listing) notFound();

  const [earnings, related] = await Promise.all([
    prisma.affiliateCommission
      .aggregate({
        where: { affiliateId: affiliate.id, productId: listing.id },
        _sum: { amount: true, reversedAmount: true },
        _count: { _all: true },
      })
      .catch(() => null),
    getAffiliateCatalogue(affiliate.id, { category: resolved.categorySlug, eligibility: "eligible" }, 1, 5),
  ]);

  const commission = Math.max(
    0,
    (earnings?._sum.amount ?? 0) - (earnings?._sum.reversedAmount ?? 0),
  );
  const discount = discountPercent(resolved.price, resolved.oldPrice ?? undefined);
  const gallery = listing.images.length > 0 ? listing.images.map((i) => i.url) : resolved.image ? [resolved.image] : [];

  return (
    <div>
      <Link
        href="/affiliate/shop"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/55 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Browse products
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* The pictures, as the shopper sees them. */}
        <div className="space-y-3">
          <div
            className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl ring-1 ring-niki-edge"
            style={{
              background: gallery[0]
                ? undefined
                : `linear-gradient(135deg, ${resolved.gradientFrom}, ${resolved.gradientTo})`,
            }}
          >
            {gallery[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gallery[0]} alt={resolved.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-7xl" aria-hidden>
                {resolved.emoji}
              </span>
            )}
          </div>
          {gallery.length > 1 ? (
            <div className="grid grid-cols-4 gap-2">
              {gallery.slice(1, 5).map((url, i) => (
                <span
                  key={`${url}-${i}`}
                  className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-niki-surface ring-1 ring-niki-edge"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <p className="flex flex-wrap items-center gap-2 text-xs text-niki-ink/55">
            <Link
              href={`/affiliate/shop/shops/${resolved.vendorSlug}`}
              className="inline-flex items-center gap-1 font-semibold hover:text-niki-orange"
            >
              <Store className="h-3 w-3" />
              {resolved.vendorName}
            </Link>
            <span aria-hidden>·</span>
            <Link
              href={`/affiliate/shop?category=${resolved.categorySlug}`}
              className="hover:text-niki-orange"
            >
              {resolved.categoryName}
            </Link>
          </p>

          <h1 className="mt-1 font-figures text-2xl font-bold text-niki-ink">{resolved.name}</h1>

          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            <span className="font-figures text-2xl font-bold text-niki-ink">
              {formatPrice(resolved.price)}
            </span>
            {resolved.oldPrice ? (
              <span className="text-sm font-medium text-niki-ink/40 line-through">
                {formatPrice(resolved.oldPrice)}
              </span>
            ) : null}
            {discount ? (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                -{discount}%
              </span>
            ) : null}
          </div>

          {/* The affiliate's answer, above everything else. */}
          <div className="mt-4 rounded-2xl bg-niki-black p-5 text-white">
            {resolved.eligible ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  You earn
                </p>
                <p className="mt-1 font-figures text-3xl font-bold">
                  +{formatPrice(resolved.earnPerSale)}
                </p>
                <p className="mt-1 text-sm text-white/70">
                  {resolved.rate}% of the sale, {RULE_LABELS[resolved.rateSource] ?? "the programme rate"} —
                  funded by {resolved.fundedBy === "platform" ? "Nickimart" : "the shop"}.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  No commission on this one
                </p>
                <p className="mt-1 text-sm text-white/70">{resolved.reason}</p>
              </>
            )}

            <div className="mt-4">
              <CatalogueRowActions
                productId={resolved.id}
                productName={resolved.name}
                price={resolved.price}
                shopName={resolved.vendorName}
                linkCode={resolved.linkCode}
                selected={resolved.selected}
                eligible={resolved.eligible}
                shareMessage={affiliate.shareMessage}
                linkBase={`${siteUrl()}/r`}
                from={`/affiliate/shop/${slug}`}
                suspended={affiliate.status !== "active"}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Sales you've made" value={earnings?._count._all ?? 0} />
            <StatCard label="Earned from it" value={formatMoney(commission)} />
            <StatCard
              label="In stock"
              value={listing.productType === "in_stock" ? listing.stockQuantity : "On order"}
            />
            <StatCard
              label="Rating"
              value={listing.reviewCount > 0 ? `${listing.rating.toFixed(1)} ★` : "New"}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {resolved.selected ? (
              <Link
                href={`/affiliate/products/${resolved.id}`}
                className="niki-press inline-flex items-center gap-1.5 rounded-lg bg-niki-orange px-4 py-2 text-sm font-semibold text-white hover:bg-niki-orange-light"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Build the flyer
              </Link>
            ) : null}
            <Link
              href={`/products/${slug}`}
              className="niki-press inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              See the public listing
            </Link>
          </div>

          <div className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <h2 className="font-display font-bold text-niki-ink">About this product</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-niki-ink/70">
              {listing.description}
            </p>
            {listing.moq > 1 ? (
              <p className="mt-3">
                <ConsolePill status="paused" label={`Sold in minimums of ${listing.moq}`} />
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {related.products.filter((p) => p.id !== resolved.id).length > 0 ? (
        <>
          <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">
            Others in {resolved.categoryName} that pay
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            {related.products
              .filter((p) => p.id !== resolved.id)
              .slice(0, 4)
              .map((p) => (
                <CatalogueCard
                  key={p.id}
                  product={{
                    id: p.id,
                    name: p.name,
                    slug: p.slug,
                    price: p.price,
                    oldPrice: p.oldPrice,
                    image: p.image,
                    emoji: p.emoji,
                    gradientFrom: p.gradientFrom,
                    gradientTo: p.gradientTo,
                    shopName: p.vendorName,
                    shopSlug: p.vendorSlug,
                    categoryName: p.categoryName,
                    eligible: p.eligible,
                    rate: p.rate,
                    earnPerSale: p.earnPerSale,
                    fundedBy: p.fundedBy,
                    reason: p.reason,
                    selected: p.selected,
                    linkCode: p.linkCode,
                  }}
                  shareMessage={affiliate.shareMessage}
                  linkBase={`${siteUrl()}/r`}
                  from={`/affiliate/shop/${slug}`}
                  suspended={affiliate.status !== "active"}
                />
              ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
