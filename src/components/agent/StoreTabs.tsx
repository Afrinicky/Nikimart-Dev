"use client";

import { useSearchParams } from "next/navigation";
import { BarChart3, BadgeDollarSign, Link2, Package, Receipt } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";
import type { StoreTab } from "@/lib/data-bundles/store-tabs";

// Labels and icons live here; the values and their validator are in
// lib/data-bundles/store-tabs so the server page can check `?tab=` without
// calling into a client module.
const TABS: Array<{ value: StoreTab; label: string; icon: React.ElementType }> = [
  { value: "overview", label: "Overview", icon: BarChart3 },
  { value: "link", label: "Store Link", icon: Link2 },
  { value: "pricing", label: "Pricing", icon: Package },
  { value: "afa", label: "AFA Pricing", icon: BadgeDollarSign },
  { value: "withdrawals", label: "Withdrawal History", icon: Receipt },
];

/**
 * The Store screen's tabs. They're links rather than local state so a tab is
 * shareable, survives a refresh, and walks back with the browser Back button —
 * and each one shows a spinner while its panel loads.
 */
export function StoreTabs({ afaEnabled = true }: { afaEnabled?: boolean }) {
  const params = useSearchParams();
  const current = params.get("tab") ?? "overview";
  const tabs = TABS.filter((t) => afaEnabled || t.value !== "afa");

  return (
    <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-black/5 px-1">
      {tabs.map(({ value, label, icon: Icon }) => {
        const active = current === value;
        return (
          <ActionLink
            key={value}
            href={`/agent/store?tab=${value}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold",
              active
                ? "border-niki-orange text-niki-orange"
                : "border-transparent text-niki-ink/55 hover:text-niki-ink",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </ActionLink>
        );
      })}
    </div>
  );
}
