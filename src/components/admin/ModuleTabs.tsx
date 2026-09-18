"use client";

import { usePathname } from "next/navigation";
import {
  Banknote,
  Gift,
  Inbox,
  LifeBuoy,
  Megaphone,
  Receipt,
  Settings2,
  SlidersHorizontal,
  Ticket,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * The tab row inside one console module.
 *
 * The sidebar says which module you are in; this says which part of it. Two
 * levels, each with one job — which is what the old console lacked: agents,
 * applications, invitations, withdrawals, support and the programme's own
 * settings were six unrelated entries in one long scroller, and nothing said
 * they were the same subject.
 *
 * A tab may point outside its own route (withdrawals is also a sidebar
 * destination in its own right), so `href` is taken literally and matching is
 * by prefix rather than by nesting.
 *
 * Icons are named rather than passed. A component is a function, and a
 * function cannot cross from a server component into a client one — handing
 * `icon: Users` across that line throws at render, which is exactly what it
 * did the first time this shipped. A name is a string, and strings travel.
 */

const ICONS = {
  users: Users,
  userplus: UserPlus,
  inbox: Inbox,
  ticket: Ticket,
  banknote: Banknote,
  lifebuoy: LifeBuoy,
  megaphone: Megaphone,
  settings: Settings2,
  trophy: Trophy,
  gift: Gift,
  receipt: Receipt,
  rules: SlidersHorizontal,
} as const;

export type TabIcon = keyof typeof ICONS;

export interface ModuleTab {
  href: string;
  label: string;
  icon?: TabIcon;
  /** Only light up on an exact match — for a module's own index route. */
  exact?: boolean;
  /** A count worth seeing before you click, e.g. applications waiting. */
  badge?: number;
}

export function ModuleTabs({ tabs }: { tabs: ModuleTab[] }) {
  const pathname = usePathname();

  return (
    <nav className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-niki-edge px-1">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.icon ? ICONS[tab.icon] : null;
        return (
          <ActionLink
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-sm font-semibold transition-colors",
              active
                ? "border-niki-orange text-niki-orange"
                : "border-transparent text-niki-ink/55 hover:text-niki-ink",
            )}
          >
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {tab.label}
            {tab.badge ? (
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                  active ? "bg-niki-orange text-white" : "bg-niki-ink/10 text-niki-ink/60",
                )}
              >
                {tab.badge}
              </span>
            ) : null}
          </ActionLink>
        );
      })}
    </nav>
  );
}
