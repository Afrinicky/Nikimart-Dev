import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarClock,
  Check,
  GraduationCap,
  MapPin,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Truck,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ProductImagePlaceholder } from "@/components/product/ProductImagePlaceholder";
import { Badge } from "@/components/ui/Badge";
import {
  getCategoryById,
  getProductBySlug,
  getProductImage,
  getRelatedProducts,
  getVendorById,
  products,
} from "@/lib/mock-data";
import { discountPercent, formatPrice } from "@/lib/format";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  return { title: product ? `${product.name} — NikiMart` : "Product — NikiMart" };
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const vendor = getVendorById(product.vendorId);
  const category = getCategoryById(product.categoryId);
  const discount = discountPercent(product.price, product.oldPrice);
  const related = getRelatedProducts(product);

  const deliveryOptions = [
    product.sameDayDeliveryAvailable && { icon: Truck, label: "Same-day delivery available" },
    product.campusDeliveryAvailable && { icon: GraduationCap, label: "Campus delivery available" },
    product.pickupAvailable && { icon: MapPin, label: "Pickup available" },
  ].filter(Boolean) as { icon: typeof Truck; label: string }[];

  return (
    <>
      <PageHeader
        title={product.name}
        crumbs={[
          { label: "Products", href: "/products" },
          ...(category ? [{ label: category.name, href: `/categories/${category.slug}` }] : []),
          { label: product.name },
        ]}
      />

      <Container className="py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-3xl ring-1 ring-black/5">
            <ProductImagePlaceholder
              gradientFrom={product.gradientFrom}
              gradientTo={product.gradientTo}
              emoji={product.emoji}
              imageUrl={getProductImage(product)}
              alt={product.name}
              className="aspect-square w-full"
            />
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              {product.badges.map((b) => (
                <Badge key={b} kind={b} />
              ))}
            </div>
          </div>

          <div>
            {vendor ? (
              <Link
                href={`/shops/${vendor.slug}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-niki-orange hover:underline"
              >
                <Store className="h-4 w-4" />
                {vendor.businessName}
                {vendor.verificationStatus === "verified" ? (
                  <ShieldCheck className="h-4 w-4 text-niki-success" />
                ) : null}
              </Link>
            ) : null}

            <h1 className="mt-2 font-display text-2xl font-bold text-niki-ink sm:text-3xl">
              {product.name}
            </h1>

            <div className="mt-3 flex items-center gap-2 text-sm text-niki-ink/60">
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-niki-gold text-niki-gold" />
                <span className="font-semibold text-niki-ink">{product.rating.toFixed(1)}</span>
              </span>
              <span>({product.reviewCount} reviews)</span>
            </div>

            <div className="mt-5 flex items-baseline gap-3">
              <span className="font-display text-3xl font-bold text-niki-ink">
                {formatPrice(product.price)}
              </span>
              {product.oldPrice ? (
                <span className="text-lg text-niki-ink/40 line-through">
                  {formatPrice(product.oldPrice)}
                </span>
              ) : null}
              {discount ? (
                <span className="rounded-full bg-niki-danger px-2 py-0.5 text-xs font-bold text-white">
                  -{discount}%
                </span>
              ) : null}
            </div>

            <p className="mt-5 text-sm leading-relaxed text-niki-ink/70">{product.description}</p>

            {product.preorderInfo ? (
              <div className="mt-5 rounded-2xl bg-niki-gold/10 p-4 text-sm ring-1 ring-niki-gold/30">
                <p className="flex items-center gap-2 font-semibold text-amber-900">
                  <CalendarClock className="h-4 w-4" />
                  Preorder item — please review before ordering
                </p>
                <ul className="mt-3 space-y-1.5 text-amber-900/80">
                  <li>Estimated arrival: {product.preorderInfo.estimatedArrival}</li>
                  <li>
                    Deposit required: {product.preorderInfo.depositValue}
                    {product.preorderInfo.depositType === "percentage" ? "%" : " GH₵"}
                  </li>
                  <li>{product.preorderInfo.balanceInstruction}</li>
                  <li>{product.preorderInfo.refundPolicy}</li>
                  <li>Sourced from: {product.preorderInfo.sourceLocation}</li>
                </ul>
              </div>
            ) : null}

            {product.serviceInfo ? (
              <div className="mt-5 rounded-2xl bg-niki-surface p-4 text-sm ring-1 ring-black/5">
                <p className="font-semibold text-niki-ink">Service details</p>
                <ul className="mt-3 space-y-1.5 text-niki-ink/70">
                  <li>Service area: {product.serviceInfo.serviceArea}</li>
                  <li>Availability: {product.serviceInfo.availability}</li>
                  <li>{product.serviceInfo.bookingNotes}</li>
                </ul>
              </div>
            ) : null}

            {deliveryOptions.length > 0 ? (
              <div className="mt-5 space-y-2">
                {deliveryOptions.map((opt) => (
                  <p key={opt.label} className="flex items-center gap-2 text-sm text-niki-ink/70">
                    <opt.icon className="h-4 w-4 text-niki-success" />
                    {opt.label}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/cart"
                className="flex items-center gap-2 rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-niki-orange/30 transition-colors hover:bg-niki-orange-light"
              >
                <ShoppingCart className="h-4 w-4" />
                {product.productType === "service" ? "Book service" : "Add to cart"}
              </Link>
              <Link
                href="/checkout"
                className="flex items-center gap-2 rounded-full bg-niki-navy px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-navy-light"
              >
                Buy now
              </Link>
            </div>

            <p className="mt-4 flex items-center gap-2 text-xs text-niki-ink/50">
              <Check className="h-3.5 w-3.5 text-niki-success" />
              Covered by NikiMart Buyer Protection
            </p>
          </div>
        </div>

        {related.length > 0 ? (
          <div className="mt-14">
            <SectionHeading title="You may also like" />
            <ProductGrid products={related} />
          </div>
        ) : null}
      </Container>
    </>
  );
}
