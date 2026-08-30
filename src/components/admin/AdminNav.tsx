"use client";

import { usePathname } from "next/navigation";
import { ActionLink } from "@/components/ui/motion";
import {
  GalleryHorizontalEnd,
  HelpCircle,
  LayoutGrid,
  LayoutDashboard,
  LayoutTemplate,
  MapPin,
  Package,
  PackageCheck,
  Settings,
  Anchor,
  ShoppingBag,
  Store,
  Truck,
  Users,
  Wallet,
  Gift,
  Scale,
  Signal,
} from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/vendors", label: "Shops", icon: Store },
  { href: "/admin/categories", label: "Categories", icon: LayoutGrid },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/data", label: "Data", icon: Signal },
  { href: "/admin/finance", label: "Finance", icon: Wallet },
  { href: "/admin/affiliates", label: "Affiliates", icon: Gift },
  { href: "/admin/pages", label: "Pages", icon: LayoutTemplate },
  { href: "/admin/banners", label: "Carousel", icon: GalleryHorizontalEnd },
  { href: "/admin/locations", label: "Locations", icon: MapPin },
  { href: "/admin/pickup-points", label: "Pickup", icon: PackageCheck },
  { href: "/admin/shipping", label: "Shipping", icon: Truck },
  { href: "/admin/arrival-points", label: "Arrival points", icon: Anchor },
  { href: "/admin/faqs", label: "FAQs", icon: HelpCircle },
  { href: "/admin/legal", label: "Policies", icon: Scale },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <ActionLink
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              active
                ? "niki-chip-active bg-niki-black text-white"
                : "niki-chip text-niki-ink/75 hover:text-niki-ink",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </ActionLink>
        );
      })}
    </nav>
  );
}
