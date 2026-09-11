"use client";

import { usePathname } from "next/navigation";
import { ActionLink } from "@/components/ui/motion";
import { Signal, Store } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The two consoles.
 *
 * Nickimart runs two businesses that share a sign-in and nothing else: the
 * retail mall, and the data-bundle store with its agent network. They have
 * separate databases, separate payment accounts and separate staff who care
 * about them, so the admin gives each its own place rather than hiding one as a
 * tab among the mall's eighteen. Whichever you pick, the tab row underneath is
 * that console's own.
 *
 * Everything under /admin/data is the bundle console; everything else is
 * retail.
 */

const CONSOLES = [
  {
    href: "/admin",
    label: "Retail Services",
    hint: "Shops, products, orders, shipping",
    icon: Store,
  },
  {
    href: "/admin/data",
    label: "Data Bundles",
    hint: "Bundles, agents, referrals",
    icon: Signal,
  },
];

/** True when this path belongs to the data-bundle console. */
export function isDataConsole(pathname: string): boolean {
  return pathname === "/admin/data" || pathname.startsWith("/admin/data/");
}

export function ConsoleSwitcher() {
  const pathname = usePathname();
  const onData = isDataConsole(pathname);

  return (
    <nav aria-label="Console" className="flex flex-wrap gap-2">
      {CONSOLES.map(({ href, label, hint, icon: Icon }) => {
        const active = href === "/admin/data" ? onData : !onData;
        return (
          <ActionLink
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-[9.5rem] flex-1 items-center gap-2.5 rounded-2xl px-4 py-3 text-left transition-colors sm:flex-none",
              active
                ? "bg-niki-black text-white ring-1 ring-niki-black"
                : "bg-white text-niki-ink/70 ring-1 ring-niki-edge hover:text-niki-ink",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                active ? "bg-white/15 text-niki-orange" : "bg-niki-orange/10 text-niki-orange",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{label}</span>
              <span
                className={cn(
                  "block truncate text-[11px] leading-tight",
                  active ? "text-white/60" : "text-niki-ink/45",
                )}
              >
                {hint}
              </span>
            </span>
          </ActionLink>
        );
      })}
    </nav>
  );
}
