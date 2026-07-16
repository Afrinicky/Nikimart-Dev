import Link from "next/link";
import { GraduationCap, Heart, MapPin, Plane, Star, Truck } from "lucide-react";
import type { Product } from "@/lib/types";
import { isAbroad } from "@/lib/countries";
import { discountPercent, formatPrice } from "@/lib/format";
import { getProductImage } from "@/lib/mock-data";
import { ProductImagePlaceholder } from "./ProductImagePlaceholder";
import { Badge } from "@/components/ui/Badge";

export function ProductCard({ product, vendorName }: { product: Product; vendorName?: string }) {
  const discount = discountPercent(product.price, product.oldPrice);
  const primaryBadges = product.badges.slice(0, 2);

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-niki-navy/10">
      <Link
        href={`/products/${product.slug}`}
        className="absolute inset-0 z-0"
        aria-label={product.name}
      />

      <div className="relative">
        <ProductImagePlaceholder
          gradientFrom={product.gradientFrom}
          gradientTo={product.gradientTo}
          emoji={product.emoji}
          imageUrl={getProductImage(product)}
          alt={product.name}
          className="aspect-square w-full transition-transform duration-500 group-hover:scale-105"
        />

        <div className="pointer-events-none absolute left-2 top-2 flex max-w-[80%] flex-wrap gap-1">
          {primaryBadges.map((badge) => (
            <Badge key={badge} kind={badge} />
          ))}
        </div>

        {discount ? (
          <div className="absolute right-2 top-2 rounded-full bg-niki-danger px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            -{discount}%
          </div>
        ) : (
          <div className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-niki-ink/50 shadow-sm">
            <Heart className="h-3.5 w-3.5" />
          </div>
        )}
      </div>

      <div className="relative z-0 flex flex-1 flex-col gap-1.5 p-3 pointer-events-none">
        {vendorName ? (
          <span className="truncate text-[11px] font-medium text-niki-ink/50">
            {vendorName}
          </span>
        ) : null}

        {isAbroad(product.originCountry) ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-niki-trust/10 px-2 py-0.5 text-[10px] font-semibold text-niki-trust">
            <Plane className="h-3 w-3" />
            Shipped from abroad
          </span>
        ) : null}

        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-niki-ink">
          {product.name}
        </h3>

        <div className="flex items-center gap-1 text-[11px] text-niki-ink/60">
          <Star className="h-3 w-3 fill-niki-gold text-niki-gold" />
          <span className="font-medium text-niki-ink">{product.rating.toFixed(1)}</span>
          <span>({product.reviewCount})</span>
        </div>

        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="font-display text-base font-bold text-niki-ink">
            {formatPrice(product.price)}
          </span>
          {product.oldPrice ? (
            <span className="text-xs text-niki-ink/40 line-through">
              {formatPrice(product.oldPrice)}
            </span>
          ) : null}
        </div>

        {(product.sameDayDeliveryAvailable || product.pickupAvailable || product.campusDeliveryAvailable) && (
          <div className="flex items-center gap-2 pt-1 text-niki-ink/45">
            {product.sameDayDeliveryAvailable ? (
              <Truck className="h-3.5 w-3.5" aria-label="Same-day delivery" />
            ) : null}
            {product.pickupAvailable ? (
              <MapPin className="h-3.5 w-3.5" aria-label="Pickup available" />
            ) : null}
            {product.campusDeliveryAvailable ? (
              <GraduationCap className="h-3.5 w-3.5" aria-label="Campus delivery" />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
