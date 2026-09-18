import "server-only";
import { dataDb } from "@/lib/data-db";
import type { ModuleTab } from "@/components/admin/ModuleTabs";

/**
 * The Agent management module's tabs, in one place so the module's own layout
 * and the pages that live outside it (withdrawals, which is also a sidebar
 * destination) show the same row.
 *
 * Announcements used to be one of these, which made a broadcast look like a
 * setting on the agent programme. It is not — it goes to bundle buyers too —
 * so it has a module of its own.
 */
export function AGENT_MODULE_TABS(waiting = 0): ModuleTab[] {
  return [
    { href: "/admin/data/agents", label: "Agents", icon: "users", exact: true },
    { href: "/admin/data/agents/new", label: "Register", icon: "userplus" },
    {
      href: "/admin/data/agents/applications",
      label: "Applications",
      icon: "inbox",
      badge: waiting,
    },
    { href: "/admin/data/agents/invites", label: "Registration links", icon: "ticket" },
    { href: "/admin/data/withdrawals", label: "Withdrawals", icon: "banknote" },
    { href: "/admin/data/agents/support", label: "Support", icon: "lifebuoy" },
    { href: "/admin/data/agents/settings", label: "Programme settings", icon: "settings" },
  ];
}

/** How many applications are waiting on a decision, for the tab's badge. */
export async function pendingApplicationCount(): Promise<number> {
  try {
    return await dataDb.dataAgentApplication.count({ where: { status: "pending" } });
  } catch {
    return 0;
  }
}
