"use client";

import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  Bell,
  LayoutDashboard,
  ListOrdered,
  LifeBuoy,
  Settings,
  Store,
  Wallet,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * The agent platform's own navigation.
 *
 * Desktop gets the sidebar from the reference screens; on a phone that column
 * would eat half the viewport, so the same list becomes a scrolling rail of
 * chips above the content. Same items, same order, same active state — just
 * laid out for the space available.
 */

const ITEMS = [
  { href: "/agent", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/agent/orders", label: "Orders", icon: ListOrdered },
  { href: "/agent/wallet", label: "Wallet", icon: Wallet },
  { href: "/agent/afa", label: "AFA", icon: BadgeCheck },
  { href: "/agent/store", label: "Store", icon: Store },
  { href: "/agent/notifications", label: "Notifications", icon: Bell },
  { href: "/agent/settings", label: "Settings", icon: Settings },
  { href: "/agent/support", label: "Support", icon: LifeBuoy },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** The sticky sidebar, shown from `lg` up. */
export function AgentSidebar({ afaEnabled = true }: { afaEnabled?: boolean }) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => afaEnabled || i.href !== "/agent/afa");

  return (
    <nav className="sticky top-6 space-y-1" aria-label="Agent platform">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(pathname, href, exact);
        return (
          <ActionLink
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold",
              active
                ? "bg-niki-orange text-white shadow-lg shadow-niki-orange/20"
                : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
            spinnerClassName="ml-auto"
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </ActionLink>
        );
      })}
    </nav>
  );
}

/** The mobile equivalent: a horizontally scrolling chip rail. */
export function AgentRail({ afaEnabled = true }: { afaEnabled?: boolean }) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => afaEnabled || i.href !== "/agent/afa");

  return (
    <nav
      className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:hidden"
      aria-label="Agent platform"
    >
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(pathname, href, exact);
        return (
          <ActionLink
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold",
              active
                ? "bg-niki-orange text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
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
