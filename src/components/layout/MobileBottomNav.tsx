"use client";

import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ShoppingCart, User } from "lucide-react";
import { ActionLink, LinkSpinner, PendingHidden } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/products", label: "Browse", icon: LayoutGrid },
  { href: "/cart", label: "Cart", icon: ShoppingCart },
  { href: "/login", label: "Account", icon: User },
];

/** The tab's icon, swapped for a spinner while that tab is loading. */
function NavIcon({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <>
      <LinkSpinner className="h-5 w-5" />
      <PendingHidden>
        <Icon className="h-5 w-5" />
      </PendingHidden>
    </>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-niki-edge bg-white/95 py-2 backdrop-blur sm:hidden">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          // Not ActionLink's default layout: the spinner has to replace the
          // icon rather than sit beside it, or the tab jumps sideways mid-tap.
          <ActionLink
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-medium",
              active ? "text-niki-orange" : "text-niki-ink/50",
            )}
            spinnerClassName="hidden"
          >
            <span className="relative flex h-5 w-5 items-center justify-center">
              <NavIcon icon={Icon} />
            </span>
            {label}
          </ActionLink>
        );
      })}
    </nav>
  );
}
