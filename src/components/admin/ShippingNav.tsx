"use client";

import { usePathname } from "next/navigation";
import { Coins, Gauge, MapPin, Plane, SlidersHorizontal } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * The screens of the shipping console, in the order they are set up.
 *
 * Points first, because nothing else means anything without them: a rule is
 * from a point to a station, and a forwarder's route lands at one. Then the two
 * halves of the bill — the run inside Ghana, and the forwarders who bring goods
 * in — and finally the exchange rates the second of those is quoted in. An
 * admin who works down this list once has a working shipping system.
 */
const TABS = [
  { href: "/admin/shipping", label: "Overview", icon: Gauge, exact: true },
  { href: "/admin/shipping/points", label: "Points", icon: MapPin },
  { href: "/admin/shipping/rates", label: "Inside Ghana", icon: SlidersHorizontal },
  { href: "/admin/shipping/abroad", label: "Forwarders", icon: Plane },
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
