"use client";

import { Gift, Shield, Signal, Store, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { ActionLink } from "@/components/ui/motion";
import { activeWorkspace, type Workspace, type WorkspaceIcon } from "@/lib/workspace-nav";
import { cn } from "@/lib/cn";

/**
 * The workspace switcher for a screen with no dark sidebar to put it in.
 *
 * The seller area is a set of ordinary pages rather than a console shell, so
 * the sidebar version has nowhere to live there. Same idea, same destinations,
 * laid out as a light row of pills above the page.
 *
 * Draws nothing when there is only one workspace: a switcher with a single
 * option is furniture pretending to be a control.
 */

const ICONS: Record<WorkspaceIcon, React.ElementType> = {
  store: Store,
  signal: Signal,
  gift: Gift,
  shield: Shield,
  user: UserRound,
};

export function WorkspaceBar({
  workspaces,
  active,
  className,
}: {
  workspaces: Workspace[];
  active?: string;
  className?: string;
}) {
  const pathname = usePathname();
  if (workspaces.length < 2) return null;

  const current = active ?? activeWorkspace(pathname, workspaces);

  return (
    <nav
      aria-label="Your workspaces"
      className={cn("scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1", className)}
    >
      {workspaces.map((space) => {
        const Icon = ICONS[space.icon] ?? Store;
        const isActive = current === space.key;
        return (
          <ActionLink
            key={space.key}
            href={space.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "niki-press niki-focus flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors",
              isActive
                ? "bg-niki-black text-white"
                : "bg-white text-niki-ink/65 ring-1 ring-niki-edge hover:bg-niki-black/5",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", isActive && "text-niki-orange")} />
            {space.label}
          </ActionLink>
        );
      })}
    </nav>
  );
}
