import "server-only";
import type { ModuleTab } from "@/components/admin/ModuleTabs";

/**
 * The Announcements module's tabs.
 *
 * Four things that all mean "something was said", and they are genuinely
 * different: an announcement sits on a screen until somebody opens it, an
 * automatic message goes out when the platform does something, a broadcast
 * leaves the building the moment you press send — and a notification is the
 * platform saying something back, to the admins rather than to a customer.
 * Putting them under one module is right; putting them on one screen would not
 * be.
 *
 * Notifications are the bundle console's own: they are raised by withdrawals,
 * applications and support requests, none of which the retail console has.
 */
export function ANNOUNCEMENT_MODULE_TABS(scope: "data" | "retail", unread = 0): ModuleTab[] {
  const base = scope === "retail" ? "/admin" : "/admin/data";
  return [
    { href: `${base}/announcements`, label: "Announcements", icon: "megaphone", exact: true },
    ...(scope === "data"
      ? [
          {
            href: "/admin/data/notifications",
            label: "Notifications",
            icon: "bell" as const,
            badge: unread,
          },
        ]
      : []),
    { href: `${base}/messages`, label: "Messages", icon: "mail" },
    { href: `${base}/broadcasts`, label: "Broadcasts", icon: "send" },
  ];
}
