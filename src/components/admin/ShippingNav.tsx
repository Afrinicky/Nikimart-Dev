"use client";

import { usePathname } from "next/navigation";
import { Gauge, MapPin, Plane, SlidersHorizontal } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * The four screens of the shipping console, in the order they are set up.
 *
 * Points first, because nothing else means anything without them: a rule is
 * from a point to a station, and a forwarder delivers into one. Then the rules
 * that price the run inside Ghana, then the forwarders that bring goods in,
 * then the numbers behind everything. An admin who works down this list once
 * has a working shipping system.
 */
const TABS = [
  { href: "/admin/shipping", label: "Overview", icon: Gauge, exact: true },
  { href: "/admin/shipping/points", label: "Points", icon: MapPin },
  { href: "/admin/shipping/rates", label: "Rates", icon: SlidersHorizontal },
  { href: "/admin/shipping/abroad", label: "From abroad", icon: Plane },
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
