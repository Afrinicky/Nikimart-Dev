"use client";

import { usePathname } from "next/navigation";
import { isDataConsole } from "@/components/admin/ConsoleSwitcher";
import { ActionLink } from "@/components/ui/motion";
import {
  ClipboardList,
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
  Truck,
  Users,
  Wallet,
  Gift,
  Scale,
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
  { href: "/admin/affiliates", label: "Affiliates", icon: Gift },
  { href: "/admin/pages", label: "Pages", icon: LayoutTemplate },
  { href: "/admin/banners", label: "Carousel", icon: GalleryHorizontalEnd },
  { href: "/admin/locations", label: "Locations", icon: MapPin },
  { href: "/admin/shipping/locations", label: "Pickup", icon: PackageCheck },
  { href: "/admin/shipping", label: "Shipping", icon: Truck },
  { href: "/admin/purchasing", label: "Order placement", icon: ClipboardList },
  { href: "/admin/faqs", label: "FAQs", icon: HelpCircle },
  { href: "/admin/legal", label: "Policies", icon: Scale },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

/**
 * The retail console's tabs.
 *
 * Data bundles are not one of them any more: they are their own console, with
 * their own tab row (DataSubNav) rendered by /admin/data/layout.tsx. Rendering
 * nothing here inside that console is what keeps the two from stacking up — the
 * switcher above is the only navigation the two share.
 */
export function AdminNav() {
  const pathname = usePathname();
  if (isDataConsole(pathname)) return null;

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
