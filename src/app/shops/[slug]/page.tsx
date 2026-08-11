import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPin, MessageCircle, ShieldCheck, Star, Store } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ShareButton } from "@/components/share/ShareButton";
import { CopyCatalogueButton } from "@/components/share/CopyCatalogueButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { locations } from "@/lib/mock-data";
import { getProductsByVendorId, getVendorBySlug } from "@/lib/catalog";
import { SELLER_TYPE_LABELS } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { waChatLink } from "@/lib/whatsapp";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) return { title: "Shop — NikiMart" };

  const title = `${vendor.businessName} — NikiMart`;
  const description = (vendor.description?.trim() || `Shop ${vendor.businessName} on NikiMart.`).slice(0, 200);
  const url = `/shops/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "NikiMart" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ShopDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) notFound();

  const items = await getProductsByVendorId(vendor.id);
  const vendorNames = { [vendor.id]: vendor.businessName };
  const locationNames = vendor.locationIds
    .map((id) => locations.find((l) => l.id === id)?.name)
    .filter(Boolean) as string[];

  // A ready-to-paste WhatsApp catalogue: product names + links + the shop link.
  const base = siteUrl();
  const catalogueText = [
    `🛍️ ${vendor.businessName} on NikiMart`,
    vendor.description?.trim() || "",
    "",
    ...items.slice(0, 30).map((p) => `• ${p.name} — ${formatPrice(p.price)}\n${base}/products/${p.slug}`),
    "",
    `See the full catalogue 👉 ${base}/shops/${vendor.slug}`,
  ]
    .filter((l) => l !== null && l !== undefined)
    .join("\n");
  const chatLink = waChatLink(
    vendor.whatsapp,
    `Hi ${vendor.businessName}, I found your shop on NikiMart and I'm interested in your products.`,
  );

  return (
    <>
      <div
        className="relative"
        style={
          vendor.bannerUrl
            ? undefined
            : { background: `linear-gradient(135deg, ${vendor.accentFrom} 0%, ${vendor.accentTo} 100%)` }
        }
      >
        {vendor.bannerUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={vendor.bannerUrl} alt={`${vendor.businessName} banner`} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/25" />
          </>
        ) : null}
        <Container className="relative py-10 sm:py-14">
          <div className="flex flex-wrap items-center gap-5">
            {vendor.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={vendor.logoUrl}
                alt={`${vendor.businessName} logo`}
                className="h-20 w-20 shrink-0 rounded-3xl bg-white object-cover ring-1 ring-white/25"
              />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-white/15 font-display text-2xl font-bold text-white ring-1 ring-white/25 backdrop-blur">
                {vendor.initials}
              </span>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
                  {vendor.businessName}
                </h1>
                {vendor.verificationStatus === "verified" ? (
                  <ShieldCheck className="h-6 w-6 text-white" />
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-niki-gold text-niki-gold" />
                  <span className="font-semibold text-white">{vendor.rating.toFixed(1)}</span>
                  ({vendor.reviewCount})
                </span>
                <span>{vendor.totalSales.toLocaleString()}+ sales</span>
                {locationNames.length > 0 ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {locationNames.join(", ")}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {vendor.sellerTypes.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/20"
                  >
                    {SELLER_TYPE_LABELS[t]}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-sm text-white/80">{vendor.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {chatLink ? (
              <a
                href={chatLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1ebe5b]"
              >
                <MessageCircle className="h-4 w-4" />
                Chat on WhatsApp
              </a>
            ) : null}
            <ShareButton path={`/shops/${vendor.slug}`} title={`${vendor.businessName} on NikiMart`} label="Share shop" tone="dark" />
            {items.length > 0 ? <CopyCatalogueButton text={catalogueText} label="Copy catalogue" tone="dark" /> : null}
          </div>
        </Container>
      </div>

      <Container className="py-8">
        <SectionHeading
          title={`Products from ${vendor.businessName}`}
          icon={<Store className="h-5 w-5 text-niki-orange" />}
        />
        {items.length > 0 ? (
          <ProductGrid products={items} vendorNames={vendorNames} />
        ) : (
          <EmptyState
            title="No products listed yet"
            message="This shop hasn't listed any products yet. Check back soon."
            actionLabel="Explore other shops"
            actionHref="/shops"
          />
        )}
      </Container>
    </>
  );
}
