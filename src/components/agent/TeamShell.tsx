import { Radio, UserPlus } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentPageHeading } from "@/components/agent/AgentUi";
import { cn } from "@/lib/cn";

const TABS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/agent/team", label: "Overview", exact: true },
  { href: "/agent/team/performance", label: "Performance" },
  { href: "/agent/team/structure", label: "Structure" },
  { href: "/agent/team/build", label: "Build" },
  { href: "/agent/team/sessions", label: "Sessions" },
];

/**
 * The team module's frame.
 *
 * It was one page with nine sections, which meant the thing you came for was
 * always below the thing you did not. Five tabs, each answering one question:
 * how is the team doing, who is selling, who brought in whom, how do I get
 * more, and when are we meeting.
 */
export function TeamShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <AgentPageHeading title="My team" subtitle="Recruit agents and earn from what they sell.">
        <div className="flex flex-wrap gap-2">
          <ActionLink
            href="/agent/team/sessions"
            className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
          >
            <Radio className="h-3.5 w-3.5" />
            Sessions
          </ActionLink>
          <ActionLink
            href="/agent/team/new"
            className="flex items-center gap-1.5 rounded-xl bg-niki-orange px-4 py-2 text-xs font-semibold text-white hover:bg-niki-orange-light"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add an agent
          </ActionLink>
        </div>
      </AgentPageHeading>

      <nav className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-niki-edge px-1">
        {TABS.map((t) => {
          const on = t.exact ? active === t.href : active.startsWith(t.href);
          return (
            <ActionLink
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "shrink-0 border-b-2 px-3.5 py-3 text-sm font-semibold transition-colors",
                on
                  ? "border-niki-orange text-niki-orange"
                  : "border-transparent text-niki-ink/55 hover:text-niki-ink",
              )}
            >
              {t.label}
            </ActionLink>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
