"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, LayoutDashboard, ListOrdered, Settings2, Tags } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin/data", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/data/bundles", label: "Bundle prices", icon: Tags },
  { href: "/admin/data/orders", label: "Bundle orders", icon: ListOrdered },
  { href: "/admin/data/afa", label: "AFA", icon: BadgeCheck },
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
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              active
                ? "bg-niki-orange text-white"
                : "bg-white text-niki-ink/70 ring-1 ring-black/5 hover:bg-niki-orange/10",
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
