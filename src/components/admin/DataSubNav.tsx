"use client";

import { usePathname } from "next/navigation";
import { ActionLink } from "@/components/ui/motion";
import {
  BadgeCheck,
  Banknote,
  LayoutDashboard,
  LifeBuoy,
  ListOrdered,
  Megaphone,
  Settings2,
  Tags,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin/data", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/data/bundles", label: "Bundle prices", icon: Tags },
  { href: "/admin/data/orders", label: "Bundle orders", icon: ListOrdered },
  { href: "/admin/data/afa", label: "AFA", icon: BadgeCheck },
  { href: "/admin/data/agents", label: "Agents", icon: Users },
  { href: "/admin/data/withdrawals", label: "Withdrawals", icon: Banknote },
  { href: "/admin/data/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/data/support", label: "Agent support", icon: LifeBuoy },
  { href: "/admin/data/settings", label: "Store settings", icon: Settings2 },
];

/** Second-level nav inside the admin console's Data section. */
export function DataSubNav() {
  const pathname = usePathname();

  return (
    <nav className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <ActionLink
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold",
              active
                ? "bg-niki-orange text-white"
                : "bg-white text-niki-ink/70 ring-1 ring-black/5 hover:bg-niki-orange/10",
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
