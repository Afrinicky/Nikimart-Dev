"use client";

import { usePathname } from "next/navigation";
import { BookUser, MessagesSquare, Radio, Zap } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * The four parts of the Messenger.
 *
 * Chats is the default because it is the thing people open the Messenger to
 * do. Automatic sits at the far end deliberately: it is the only part that
 * changes what the platform says on its own, and it should take a decision to
 * get to rather than being the first thing a thumb lands on.
 *
 * Links rather than state, so each part is an address — a conversation can be
 * sent to a colleague, and Back walks where you have been.
 */
export function MessengerTabs({ scope }: { scope: "data" | "retail" }) {
  const pathname = usePathname();
  const base = scope === "retail" ? "/admin" : "/admin/data";

  const tabs = [
    {
      href: `${base}/messenger`,
      label: "Chats",
      icon: MessagesSquare,
      exact: true,
      hint: "Write to one person, and everything you have said to them",
    },
    {
      href: `${base}/messenger/contacts`,
      label: "Contacts",
      icon: BookUser,
      hint: "The address book, its groups, and Excel in and out",
    },
    {
      href: `${base}/broadcasts`,
      label: "Broadcast",
      icon: Radio,
      hint: "One message to a whole group at once",
    },
    {
      href: `${base}/messages`,
      label: "Automatic",
      icon: Zap,
      hint: "What the platform says by itself, and the switches for it",
    },
  ];

  return (
    <div
      role="tablist"
      aria-label="Messenger"
      className="flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 ring-1 ring-niki-edge sm:gap-2"
    >
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <ActionLink
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            title={tab.hint}
            className={cn(
              "niki-focus flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm",
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
