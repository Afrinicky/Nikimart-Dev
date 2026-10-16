"use client";

import { usePathname } from "next/navigation";
import { Receipt, Scale } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * Two questions about the same money.
 *
 * The ledger answers "what moved, and when" — a row per payment, per payout,
 * per refund. It cannot answer "did we make anything on that order", because
 * the answer is a subtraction across rows that live in three tables. So that
 * is a tab of its own rather than a column nobody could compute.
 */
const TABS = [
  {
    href: "/admin/transactions",
    label: "Money movements",
    icon: Receipt,
    hint: "Every cedi in and out, as it happened",
    exact: true,
  },
  {
    href: "/admin/transactions/orders",
    label: "Order economics",
    icon: Scale,
    hint: "What each order sold for, cost, and made",
    exact: false,
  },
] as const;

export function TransactionTabs() {
  const pathname = usePathname();

  return (
    <div
      role="tablist"
      aria-label="Transactions"
      className="flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 ring-1 ring-niki-edge sm:flex-wrap sm:gap-2"
    >
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <ActionLink
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            title={tab.hint}
            className={cn(
              "niki-focus group flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors sm:flex-none sm:justify-start sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm",
              active
                ? "bg-niki-black text-white"
                : "text-niki-ink/60 hover:bg-niki-black/5 hover:text-niki-ink",
            )}
          >
            <tab.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </ActionLink>
        );
      })}
    </div>
  );
}
