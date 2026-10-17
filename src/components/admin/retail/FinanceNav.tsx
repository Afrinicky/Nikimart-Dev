"use client";

import { usePathname } from "next/navigation";
import { Banknote, Gauge, Receipt, Scale } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * One console for the money.
 *
 * Finance and Transactions were two sidebar entries over the same cedis:
 * Finance held the totals and the payout forms, Transactions held the rows
 * they were made of, and both carried their own version of "what has gone out
 * to sellers". Reconciling meant opening the two and trusting that they
 * agreed.
 *
 * Four tabs of one module now. The overview is the position; the movements are
 * the evidence; the order economics is what the trading earned; and the
 * settlements tab is the only place a seller is paid.
 */
const TABS: { href: string; label: string; icon: React.ElementType; exact?: boolean }[] = [
  { href: "/admin/finance", label: "Overview", icon: Gauge, exact: true },
  { href: "/admin/finance/settlements", label: "Seller settlements", icon: Banknote },
  { href: "/admin/finance/transactions", label: "Money movements", icon: Receipt },
  { href: "/admin/finance/orders", label: "Order economics", icon: Scale },
];

export function FinanceNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Finance"
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
