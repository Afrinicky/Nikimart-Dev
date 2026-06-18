import Link from "next/link";
import { MapPin, ShieldCheck, Star } from "lucide-react";
import type { Vendor } from "@/lib/types";
import { SELLER_TYPE_LABELS } from "@/lib/types";
import { locations } from "@/lib/mock-data";

export function VendorCard({ vendor }: { vendor: Vendor }) {
  const locationNames = vendor.locationIds
    .map((id) => locations.find((l) => l.id === id)?.name)
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");

  return (
    <Link
      href={`/shops/${vendor.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-niki-navy/10"
    >
      <div
        className="h-16 w-full"
        style={{
          background: `linear-gradient(120deg, ${vendor.accentFrom} 0%, ${vendor.accentTo} 100%)`,
        }}
      />
      <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
        <div
          className="-mt-7 flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-white text-base font-bold text-white shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${vendor.accentFrom} 0%, ${vendor.accentTo} 100%)`,
          }}
        >
          {vendor.initials}
        </div>

        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-sm font-bold text-niki-ink">
            {vendor.businessName}
          </h3>
          {vendor.verificationStatus === "verified" ? (
            <ShieldCheck className="h-4 w-4 shrink-0 text-blue-500" aria-label="Verified Seller" />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1">
          {vendor.sellerTypes.slice(0, 2).map((type) => (
            <span
              key={type}
              className="rounded-full bg-niki-surface px-2 py-0.5 text-[10px] font-semibold text-niki-ink/70 ring-1 ring-black/5"
            >
              {SELLER_TYPE_LABELS[type]}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between pt-1 text-xs text-niki-ink/60">
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-niki-gold text-niki-gold" />
            <span className="font-semibold text-niki-ink">{vendor.rating.toFixed(1)}</span>
            <span>({vendor.reviewCount})</span>
          </span>
          {locationNames ? (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{locationNames}</span>
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
