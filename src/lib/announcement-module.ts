import "server-only";
import type { ModuleTab } from "@/components/admin/ModuleTabs";

/**
 * The Announcements module's tabs.
 *
 * Three things that all mean "say something to people", and they are genuinely
 * different: an announcement sits on a screen until somebody opens it, an
 * automatic message goes out when the platform does something, and a broadcast
 * leaves the building the moment you press send. Putting them under one module
 * is right; putting them on one screen would not be.
 */
export function ANNOUNCEMENT_MODULE_TABS(scope: "data" | "retail"): ModuleTab[] {
  const base = scope === "retail" ? "/admin" : "/admin/data";
  return [
    { href: `${base}/announcements`, label: "Announcements", icon: "megaphone", exact: true },
    { href: `${base}/messages`, label: "Messages", icon: "mail" },
    { href: `${base}/broadcasts`, label: "Broadcasts", icon: "send" },
  ];
}
