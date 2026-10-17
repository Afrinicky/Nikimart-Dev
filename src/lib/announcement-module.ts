import "server-only";
import type { ModuleTab } from "@/components/admin/ModuleTabs";

/**
 * The Announcements module's tabs.
 *
 * Things that all mean "something was said", and they are genuinely different:
 * an announcement sits on a screen until somebody opens it, the Messenger is
 * somebody at this end deciding to write, and a notification is the platform
 * saying something back, to the admins rather than to a customer. Putting them
 * under one module is right; putting them on one screen would not be.
 *
 * Messages and Broadcasts used to be two tabs here. They are two parts of one
 * thing — writing to people — so they are now two parts of the Messenger,
 * which owns its own tab row (components/admin/messenger/MessengerTabs). Both
 * addresses still work and still land where they always did; they are simply
 * reached from inside the Messenger now rather than from beside it.
 *
 * Notifications are the bundle console's own: they are raised by withdrawals,
 * applications and support requests, none of which the retail console has.
 *
 * Complaints are the retail console's own, for the same reason in reverse:
 * buyers, affiliates and suppliers all raise them against an order, and only
 * the retail side has orders.
 */
export function ANNOUNCEMENT_MODULE_TABS(
  scope: "data" | "retail",
  unread = 0,
  open = 0,
): ModuleTab[] {
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
    ...(scope === "retail"
      ? [
          {
            href: "/admin/announcements/enquiries",
            label: "Complaints & enquiries",
            icon: "lifebuoy" as const,
            badge: open,
          },
        ]
      : []),
    { href: `${base}/messenger`, label: "Messenger", icon: "mail" },
  ];
}
