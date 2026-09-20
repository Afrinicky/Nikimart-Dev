import { ActionLink } from "@/components/ui/motion";
import { AgentPageHeading } from "@/components/agent/AgentUi";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/agent/chatroom", label: "Rooms", exact: true },
  { href: "/agent/chatroom/direct", label: "Direct" },
  { href: "/agent/chatroom/requests", label: "Requests" },
] as const;

/** The agent's chatroom frame: one heading, one tab row, every screen. */
export function AgentChatroomShell({
  active,
  requests = 0,
  action,
  children,
}: {
  active: string;
  requests?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5 pb-20 sm:pb-0">
      <AgentPageHeading title="Chatroom" subtitle="Your rooms, sessions and messages.">
        {action}
      </AgentPageHeading>

      <nav className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-niki-edge px-1">
        {TABS.map((t) => {
          const on = active === t.href;
          return (
            <ActionLink
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-sm font-semibold transition-colors",
                on
                  ? "border-niki-orange text-niki-orange"
                  : "border-transparent text-niki-ink/55 hover:text-niki-ink",
              )}
            >
              {t.label}
              {t.href.endsWith("/requests") && requests > 0 ? (
                <span className="rounded-md bg-niki-orange px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {requests}
                </span>
              ) : null}
            </ActionLink>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
