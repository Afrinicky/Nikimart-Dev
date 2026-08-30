import {
  AlertTriangle,
  BadgeCheck,
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

/**
 * Badges are solid, never tinted.
 *
 * They used to be a 10%-opacity wash of their own colour with coloured text —
 * which looks well-mannered on a white card and disappears completely the
 * moment it sits on a product photo. Half of them ride on top of the image, so
 * "In Stock" over a dark ribbed background or a busy kitchen shot was a faint
 * smudge. Jumia and Alibaba both solve this the same way: a flat block of
 * colour that carries its own contrast and owes nothing to what is behind it.
 *
 * Every pairing below clears 4.5:1, which is why some of the colours are a step
 * darker than the brand swatch — white on #10b981 is 2.1:1 and unreadable at
 * 10px. Orange keeps ink text rather than white for the same reason: white on
 * Nickimart orange is 2.4:1, ink on it is 6.7:1.
 *
 * The palette is deliberately short. Only the colours a shopper already reads
 * without being taught earn a hue of their own: green for available, red for
 * running out, orange and gold for the shop's own promotions. Blue, teal and
 * slate were carrying "verified seller", "service" and "local shop" — three
 * more hues that mean nothing on sight, on a card that may show four badges at
 * once. Those are neutral now, and their icon and label do the work.
 */
const BADGE_STYLES: Record<BadgeKind, string> = {
  in_stock: "bg-emerald-700 text-white",
  shipped_from_abroad: "bg-niki-black text-niki-gold",
  same_day_delivery: "bg-emerald-700 text-white",
  pickup_available: "bg-niki-black text-white",
  campus_delivery: "bg-niki-orange text-niki-black",
  verified_seller: "bg-niki-black text-white",
  official: "bg-niki-black text-niki-orange",
  deposit_required: "bg-amber-700 text-white",
  imported_item: "bg-niki-black-mute text-white",
  local_shop: "bg-niki-black-mute text-white",
  service: "bg-niki-black-mute text-white",
  limited_stock: "bg-red-600 text-white",
  flash_sale: "bg-red-600 text-white",
  food_vendor: "bg-niki-orange text-niki-black",
  top_rated: "bg-niki-gold text-niki-black",
};

const BADGE_ICONS: Partial<Record<BadgeKind, LucideIcon>> = {
  in_stock: CheckCircle2,
  shipped_from_abroad: Plane,
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
        // The pale ring and the shadow are doing real work. A solid badge is
        // legible against almost anything, but not against its own colour — a
        // red discount tag on a red dress vanished completely. The hairline
        // gives every badge an edge of its own; it disappears on white, where
        // the badge already contrasts, and rescues it everywhere else.
        "inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap",
        "ring-1 ring-white/70 shadow-[0_1px_3px_rgba(19,19,19,0.32)]",
        size === "sm" ? "px-2 py-[3px] text-[10px]" : "px-3 py-1 text-xs",
        BADGE_STYLES[kind],
        className,
      )}
    >
      {Icon ? <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} /> : null}
      {BADGE_LABELS[kind]}
    </span>
  );
}
