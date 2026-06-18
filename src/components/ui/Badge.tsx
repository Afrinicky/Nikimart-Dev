import {
  AlertTriangle,
  BadgeCheck,
  Clock3,
  GraduationCap,
  MapPin,
  Plane,
  ShieldCheck,
  Star,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet,
  Wrench,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { BADGE_LABELS, type BadgeKind } from "@/lib/types";
import { cn } from "@/lib/cn";

const BADGE_STYLES: Record<BadgeKind, string> = {
  in_stock: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  preorder: "bg-niki-navy text-niki-gold ring-1 ring-niki-gold/40",
  same_day_delivery: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  pickup_available: "bg-niki-surface text-niki-navy ring-1 ring-niki-navy/15",
  campus_delivery: "bg-niki-orange/10 text-niki-orange ring-1 ring-niki-orange/30",
  verified_seller: "bg-blue-50 text-blue-600 ring-1 ring-blue-200",
  official: "bg-niki-navy text-niki-orange ring-1 ring-niki-orange/40",
  deposit_required: "bg-amber-50 text-amber-700 ring-1 ring-amber-300",
  imported_item: "bg-niki-navy-soft/10 text-niki-navy ring-1 ring-niki-navy/20",
  local_shop: "bg-niki-surface text-niki-ink ring-1 ring-niki-ink/10",
  service: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  limited_stock: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
  flash_sale: "bg-niki-danger text-white ring-1 ring-niki-danger/40",
  food_vendor: "bg-niki-orange/10 text-niki-orange ring-1 ring-niki-orange/30",
  top_rated: "bg-niki-gold/15 text-amber-700 ring-1 ring-niki-gold/40",
};

const BADGE_ICONS: Partial<Record<BadgeKind, LucideIcon>> = {
  in_stock: CheckCircle2,
  preorder: Clock3,
  same_day_delivery: Truck,
  pickup_available: MapPin,
  campus_delivery: GraduationCap,
  verified_seller: ShieldCheck,
  official: BadgeCheck,
  deposit_required: Wallet,
  imported_item: Plane,
  local_shop: Store,
  service: Wrench,
  limited_stock: AlertTriangle,
  flash_sale: Star,
  food_vendor: UtensilsCrossed,
  top_rated: Star,
};

export function Badge({
  kind,
  size = "sm",
  className,
}: {
  kind: BadgeKind;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = BADGE_ICONS[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
        BADGE_STYLES[kind],
        className,
      )}
    >
      {Icon ? <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} /> : null}
      {BADGE_LABELS[kind]}
    </span>
  );
}
