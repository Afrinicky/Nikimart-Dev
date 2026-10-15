import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Image as ImageIcon } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { AffiliateFlyerStudio } from "@/components/affiliate/AffiliateFlyerStudio";
import { StatCard } from "@/components/dashboard/StatCard";
import { ConsolePill } from "@/components/affiliate/ConsoleTable";
import { prisma } from "@/lib/prisma";
import { affiliateLink, requireAffiliateConsole } from "@/lib/affiliate-console";
import { getAffiliateBranding } from "@/lib/affiliate-branding";
import { getCatalogueProduct } from "@/lib/affiliate-catalogue";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { discountPercent, formatMoney, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Share a product — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One product, ready to post.
 *
 * This is the screen the whole console exists to get somebody to: the flyer,
 * the caption, the link, and the one button that puts all three into WhatsApp.
 * It is the data-bundle flyer studio applied to a retail listing, on purpose —
 * agents already share a picture, a line of text and a link, and that is the
 * motion that works.
 */
export default async function AffiliateProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const { id } = await params;

  const promotion = await prisma.affiliateProduct
    .findFirst({
      where: { affiliateId: affiliate.id, productId: id },
      select: { id: true, linkCode: true, shareMessage: true, flyerTheme: true, clicks: true, lastSharedAt: true },
    })
    .catch(() => null);

  const product = await prisma.product.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!product) notFound();

  const [resolved, policy, branding, earnings] = await Promise.all([
    getCatalogueProduct(affiliate.id, product.slug),
    getAffiliatePolicy(),
    getAffiliateBranding(affiliate),
    prisma.affiliateCommission
      .aggregate({
        where: { affiliateId: affiliate.id, productId: id },
        _sum: { amount: true, reversedAmount: true },
        _count: { _all: true },
      })
      .catch(() => null),
  ]);
  if (!resolved) notFound();

  // Not on their list yet: the flyer still works, and the link it prints is
  // the store-wide one until they add it. Offering the studio either way is
  // deliberate — somebody deciding whether to promote something wants to see
  // what the post would look like first.
  const link = promotion ? affiliateLink(promotion.linkCode) : affiliateLink(affiliate.code);
  const message = promotion?.shareMessage || affiliate.shareMessage || policy.shareMessage;
  const commission = Math.max(
    0,
    (earnings?._sum.amount ?? 0) - (earnings?._sum.reversedAmount ?? 0),
  );

  return (
    <div>
      <Link
        href="/affiliate/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/55 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        My products
      </Link>

      <ModuleHeader title={resolved.name} subtitle={`${resolved.vendorName} · ${resolved.categoryName}`} icon={ImageIcon}>
        <Link
          href={`/products/${resolved.slug}`}
          className="niki-press inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          See the listing
        </Link>
      </ModuleHeader>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Price" value={formatPrice(resolved.price)} />
        <StatCard
          label="You earn per sale"
          value={resolved.eligible ? `+${formatPrice(resolved.earnPerSale)}` : "—"}
        />
        <StatCard label="Clicks on your link" value={(promotion?.clicks ?? 0).toLocaleString("en-GB")} />
        <StatCard label="Earned so far" value={formatMoney(commission)} />
      </div>

      {!resolved.eligible ? (
        <p className="mt-4 rounded-2xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-800 ring-1 ring-niki-gold/30">
          {resolved.reason} You can still share it — it just won&apos;t pay commission until the
          shop or Nickimart enrols it.
        </p>
      ) : null}

      {!promotion ? (
        <p className="mt-4 rounded-2xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/65 ring-1 ring-niki-edge">
          This isn&apos;t on your list yet, so the flyer carries your store-wide link. Add it from
          the{" "}
          <Link href="/affiliate/catalogue" className="font-semibold text-niki-orange hover:underline">
            catalogue
          </Link>{" "}
          to get a link of its own and per-product figures.
        </p>
      ) : null}

      <section className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-niki-ink">Your flyer</h2>
            <p className="text-xs text-niki-ink/55">
              Picture, your message and your link — exactly what goes into WhatsApp.
            </p>
          </div>
          {resolved.eligible ? (
            <ConsolePill status="live" label={`${resolved.rate}% commission`} />
          ) : (
            <ConsolePill status="ineligible" label="No commission" />
          )}
        </div>

        <AffiliateFlyerStudio
          promotionId={promotion?.id ?? null}
          data={{
            name: resolved.name,
            price: formatPrice(resolved.price),
            oldPrice: resolved.oldPrice ? formatPrice(resolved.oldPrice) : null,
            discount: discountPercent(resolved.price, resolved.oldPrice ?? undefined)
              ? `-${discountPercent(resolved.price, resolved.oldPrice ?? undefined)}%`
              : null,
            shopName: resolved.vendorName,
            categoryName: resolved.categoryName,
            link,
            sharedBy: affiliate.name,
            emoji: resolved.emoji,
            gradientFrom: resolved.gradientFrom,
            gradientTo: resolved.gradientTo,
          }}
          imageUrl={resolved.image}
          initialMessage={message}
          design={
            promotion?.flyerTheme
              ? { ...branding.design, theme: promotion.flyerTheme }
              : branding.design
          }
          watermark={branding.watermark}
          logoUrl={branding.logoUrl}
          link={link}
        />
      </section>
    </div>
  );
}
