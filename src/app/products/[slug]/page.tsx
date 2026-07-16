import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarClock,
  Check,
  GraduationCap,
  MapPin,
  Plane,
  ShieldCheck,
  Star,
  Store,
  Truck,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ProductGallery } from "@/components/product/ProductGallery";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { Badge } from "@/components/ui/Badge";
import {
  getCategories,
  getProductBySlug,
  getRelatedProducts,
  getVendorById,
  getVendorNameMap,
} from "@/lib/catalog";
import { discountPercent, formatPrice } from "@/lib/format";
import { countryByCode, estimatedArrival, isAbroad } from "@/lib/countries";
import { getLeadDays } from "@/lib/settings";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return { title: product ? `${product.name} — NikiMart` : "Product — NikiMart" };
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [vendor, categories, related, vendorNames] = await Promise.all([
    getVendorById(product.vendorId),
    getCategories(),
    getRelatedProducts(product),
    getVendorNameMap(),
  ]);
  const category = categories.find((c) => c.id === product.categoryId);
  const discount = discountPercent(product.price, product.oldPrice);

  const abroad = isAbroad(product.originCountry);
  const originCountry = countryByCode(product.originCountry);
  const leadDays = abroad ? await getLeadDays(product.originCountry ?? "") : 0;
  const arrivalDate = abroad ? estimatedArrival(leadDays) : null;

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
          <div>
            <ProductGallery
              images={product.images ?? []}
              gradientFrom={product.gradientFrom}
              gradientTo={product.gradientTo}
              emoji={product.emoji}
              alt={product.name}
            />
            {product.badges.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {product.badges.map((b) => (
                  <Badge key={b} kind={b} />
                ))}
              </div>
            ) : null}
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

            {abroad && arrivalDate ? (
              <div className="mt-5 flex items-start gap-3 rounded-2xl bg-niki-trust/10 p-4 ring-1 ring-niki-trust/20">
                <Plane className="mt-0.5 h-5 w-5 shrink-0 text-niki-trust" />
                <div className="text-sm">
                  <p className="font-semibold text-niki-trust">
                    Shipped from abroad{originCountry ? ` · ${originCountry.flag} ${originCountry.name}` : ""}
                  </p>
                  <p className="mt-1 text-niki-ink/70">
                    Estimated arrival:{" "}
                    <span className="font-semibold text-niki-ink">
                      {arrivalDate.toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })}
                    </span>{" "}
                    <span className="text-niki-ink/50">(~{leadDays} days)</span>
                  </p>
                  <p className="mt-1 text-xs text-niki-ink/50">
                    Delivered to your door or pickup point once it clears customs.
                  </p>
                </div>
              </div>
            ) : null}

            {product.attributes && product.attributes.length > 0 ? (
              <div className="mt-6">
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-niki-ink/70">
                  Key attributes
                </h2>
                <div className="mt-2 overflow-hidden rounded-xl ring-1 ring-black/5">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-black/5">
                      {product.attributes.map((attr, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-niki-surface"}>
                          <th className="w-2/5 px-4 py-2.5 text-left font-medium text-niki-ink/60">{attr.label}</th>
                          <td className="px-4 py-2.5 font-medium text-niki-ink">{attr.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

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

            <div className="mt-7">
              <AddToCartButton
                addLabel={product.productType === "service" ? "Book service" : "Add to cart"}
                item={{
                  productId: product.id,
                  slug: product.slug,
                  name: product.name,
                  price: product.price,
                  emoji: product.emoji,
                  gradientFrom: product.gradientFrom,
                  gradientTo: product.gradientTo,
                  image: product.image,
                  vendorId: product.vendorId,
                }}
              />
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
            <ProductGrid products={related} vendorNames={vendorNames} />
          </div>
        ) : null}
      </Container>
    </>
  );
}
