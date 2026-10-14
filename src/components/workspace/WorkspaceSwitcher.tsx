"use client";

import { Gift, Shield, Signal, Store, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { ActionLink } from "@/components/ui/motion";
import { activeWorkspace, type Workspace, type WorkspaceIcon } from "@/lib/workspace-nav";
import { cn } from "@/lib/cn";

/**
 * The way across between consoles, in the sidebar where the admin console
 * already put it.
 *
 * The admin had Retail and Data bundles as two entries at the top of one list,
 * and it works because it says what the alternative *is* rather than hiding it
 * behind a menu. Everybody else had nothing: an agent who was also an
 * affiliate had to know the URL, or sign out and in again. So the same block
 * appears in every console, listing the ones this person actually holds.
 *
 * One workspace is not a choice, so it draws nothing at all — a switcher with
 * a single option in it is furniture pretending to be a control.
 */

const ICONS: Record<WorkspaceIcon, React.ElementType> = {
  store: Store,
  signal: Signal,
  gift: Gift,
  shield: Shield,
  user: UserRound,
};

export function WorkspaceSwitcher({
  workspaces,
  collapsed = false,
  /** Which one to light up, when the path alone cannot say. */
  active,
}: {
  workspaces: Workspace[];
  collapsed?: boolean;
  active?: string;
}) {
  const pathname = usePathname();
  if (workspaces.length < 2) return null;

  const current = active ?? activeWorkspace(pathname, workspaces);

  return (
    <div className={cn("space-y-1 px-3 pb-3", collapsed && "px-2")}>
      {!collapsed ? (
        <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
          Workspace
        </p>
      ) : null}
      {workspaces.map((space) => {
        const Icon = ICONS[space.icon] ?? Store;
        const isActive = current === space.key;
        return (
          <ActionLink
            key={space.key}
            href={space.href}
            aria-current={isActive ? "page" : undefined}
            title={collapsed ? `${space.label} — ${space.hint}` : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              isActive
                ? "bg-white/12 text-white ring-1 ring-white/15"
                : "text-white/45 hover:bg-white/8 hover:text-white/80",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-niki-orange")} />
            {!collapsed ? (
              <span className="min-w-0 flex-1 truncate">
                {space.label}
                <span className="block truncate text-[10px] font-medium text-white/30">
                  {space.hint}
                </span>
              </span>
            ) : null}
          </ActionLink>
        );
      })}
    </div>
  );
}
