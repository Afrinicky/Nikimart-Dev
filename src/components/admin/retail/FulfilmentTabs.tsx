"use client";

import { usePathname } from "next/navigation";
import { ClipboardList, ListOrdered, Radar } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * The two halves of one job, as two tabs.
 *
 * Orders and order placement were separate entries in the sidebar, which read
 * as two unrelated screens and worked as one: every row in the placement queue
 * is a line of an order on the other screen, and an admin moving between them
 * lost the thread each time. They are tabs of one module now — the order book,
 * and the buying it is waiting on.
 *
 * Links rather than state, so a tab is an address: a filtered queue can be
 * sent to somebody, and Back walks the tabs you opened.
 */

const TABS = [
  {
    href: "/admin/orders",
    label: "Orders",
    icon: ListOrdered,
    hint: "Every order, who bought it and where it is",
  },
  {
    href: "/admin/orders/placement",
    label: "Order placement",
    icon: ClipboardList,
    hint: "What has to be bought from the suppliers",
  },
  {
    href: "/admin/orders/tracker",
    label: "Tracker",
    icon: Radar,
    hint: "How long every order has been where it is, and what is late",
  },
] as const;

export function FulfilmentTabs({ counts }: { counts?: Partial<Record<string, number>> }) {
  const pathname = usePathname();

  return (
    <div
      role="tablist"
      aria-label="Order fulfilment"
      className="flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 ring-1 ring-niki-edge sm:flex-wrap sm:gap-2"
    >
      {TABS.map((tab) => {
        const active =
          tab.href === "/admin/orders"
            ? pathname === "/admin/orders" ||
              /^\/admin\/orders\/(?!placement|tracker)/.test(pathname)
            : pathname.startsWith(tab.href);
        const count = counts?.[tab.href];
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
            {count === undefined ? null : (
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-figures text-[11px] font-bold",
                  active ? "bg-white/15 text-white" : "bg-niki-black/5 text-niki-ink/55",
                )}
              >
                {count}
              </span>
            )}
          </ActionLink>
        );
      })}
    </div>
  );
}
