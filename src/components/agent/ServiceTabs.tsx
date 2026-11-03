"use client";

import { useSearchParams } from "next/navigation";
import { BadgeDollarSign, ImageDown, Package, Receipt } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";
import type { ServiceTab } from "@/lib/data-bundles/service-tabs";

// Labels and icons live here; the values and their validator are in
// lib/data-bundles/service-tabs so the server page can check `?tab=` without
// calling into a client module.
const TABS: Array<{ value: ServiceTab; label: string; icon: React.ElementType }> = [
  { value: "catalogue", label: "Catalogue", icon: Package },
  { value: "pricing", label: "Pricing", icon: BadgeDollarSign },
  { value: "orders", label: "Orders", icon: Receipt },
  { value: "flyer", label: "Flyer", icon: ImageDown },
];

/**
 * The Products screen's tabs. Links rather than local state so a tab is
 * shareable, survives a refresh and walks back with the Back button.
 */
export function ServiceTabs() {
  const params = useSearchParams();
  const current = params.get("tab") ?? "catalogue";

  return (
    <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-niki-edge px-1">
      {TABS.map(({ value, label, icon: Icon }) => {
        const active = current === value;
        return (
          <ActionLink
            key={value}
            href={`/agent/products?tab=${value}`}
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
