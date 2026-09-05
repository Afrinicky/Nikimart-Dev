"use client";

import { usePathname } from "next/navigation";
import { Coins, Gauge, Grid3x3, MapPin, Plane } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * The screens of the shipping console, in the order they are set up.
 *
 * The places first, because nothing else means anything without them: every
 * station buyers collect at and every point goods gather at, in one list. Then
 * the grid, which prices every run between them — the first item, each extra
 * one, and the large goods that are priced by their size instead. Then the
 * forwarders, who hold their own warehouses and their own rate grids. Then the
 * exchange rates their quotes are converted at. An admin who works down this
 * list once has a working system.
 */
const TABS = [
  { href: "/admin/shipping", label: "Overview", icon: Gauge, exact: true },
  { href: "/admin/shipping/locations", label: "Pickup points", icon: MapPin },
  { href: "/admin/shipping/lanes", label: "Base fees", icon: Grid3x3 },
  { href: "/admin/shipping/forwarders", label: "Forwarders", icon: Plane },
  { href: "/admin/shipping/currencies", label: "Currencies", icon: Coins },
];

export function ShippingNav() {
  const pathname = usePathname();

  return (
    <nav className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <ActionLink
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
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
