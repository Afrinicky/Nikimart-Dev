"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  ShoppingBag,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/vendors", label: "Shops", icon: Store },
  { href: "/admin/categories", label: "Categories", icon: LayoutGrid },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/finance", label: "Finance", icon: Wallet },
  { href: "/admin/pages", label: "Pages", icon: LayoutTemplate },
  { href: "/admin/banners", label: "Carousel", icon: GalleryHorizontalEnd },
  { href: "/admin/locations", label: "Locations", icon: MapPin },
  { href: "/admin/pickup-points", label: "Pickup", icon: PackageCheck },
  { href: "/admin/faqs", label: "FAQs", icon: HelpCircle },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              active
                ? "bg-niki-navy text-white"
                : "bg-white text-niki-ink/70 ring-1 ring-black/5 hover:bg-niki-navy/5",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
