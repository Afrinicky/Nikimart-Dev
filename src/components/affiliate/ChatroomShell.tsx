import { ActionLink } from "@/components/ui/motion";
import { AFFILIATE_ROOM_TABS } from "@/lib/chat/module";
import { cn } from "@/lib/cn";

/**
 * The affiliate's chatroom frame: one heading, one tab row, every screen.
 *
 * Deliberately the agent console's shape. The two programmes do the same thing
 * here — rooms Nickimart puts you in, the people in your own team, and whoever
 * is waiting to be let in — and somebody who is both should not have to learn
 * it twice.
 */
export function AffiliateChatroomShell({
  active,
  requests = 0,
  children,
}: {
  active: string;
  requests?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-xl font-bold text-niki-ink sm:text-2xl">Chatroom</h1>
        <p className="mt-1 text-sm text-niki-ink/60">Your rooms, your team, your messages.</p>
      </header>

      <nav className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-niki-edge px-1">
        {AFFILIATE_ROOM_TABS().map((t) => {
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
