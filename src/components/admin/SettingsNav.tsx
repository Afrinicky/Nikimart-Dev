"use client";

import { usePathname } from "next/navigation";
import {
  GalleryHorizontalEnd,
  HelpCircle,
  LayoutGrid,
  LayoutTemplate,
  Scale,
  SlidersHorizontal,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * Everything that configures the storefront, in one place.
 *
 * Categories, pages, the carousel, the FAQs and the policies were five
 * sidebar entries of their own, which made the sidebar a list of tables
 * rather than a list of jobs — and buried the settings that actually run the
 * shop among them. They are what the storefront is made of, so they are tabs
 * of the screen where it is set up.
 */
const TABS: { href: string; label: string; icon: React.ElementType; exact?: boolean }[] = [
  { href: "/admin/settings", label: "General", icon: SlidersHorizontal, exact: true },
  { href: "/admin/settings/categories", label: "Categories", icon: LayoutGrid },
  { href: "/admin/settings/pages", label: "Pages", icon: LayoutTemplate },
  { href: "/admin/settings/carousel", label: "Carousel", icon: GalleryHorizontalEnd },
  { href: "/admin/settings/faqs", label: "FAQs", icon: HelpCircle },
  { href: "/admin/settings/policies", label: "Policies", icon: Scale },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings"
      className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1"
    >
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
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors sm:gap-2 sm:px-4 sm:text-sm",
              active
                ? "niki-chip-active bg-niki-black text-white"
                : "niki-chip text-niki-ink/75 hover:text-niki-ink",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </ActionLink>
        );
      })}
    </nav>
  );
}
