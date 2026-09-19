"use client";

import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  Bell,
  Inbox,
  LifeBuoy,
  UserPlus,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { formatWhen } from "@/components/agent/AgentUi";
import { NOTIFICATION_TONES } from "@/lib/data-bundles/notification-rules";
import {
  markAllNotificationsRead,
  openNotification,
} from "@/lib/data-bundles/notification-actions";
import { cn } from "@/lib/cn";

/**
 * The bell on the overview: what has happened, without leaving the page.
 *
 * The overview already answers "how is the business doing". This answers the
 * other question an admin opens it with — "is anything waiting on me" — which
 * was previously only answerable by walking the sidebar and counting.
 *
 * Opening it reads nothing. A notice is marked read by being acted on, so the
 * count survives a glance on a phone and only falls when somebody has actually
 * dealt with something. The panel shows the latest few whether read or not,
 * because "what came in this morning" is a question people ask after they have
 * already handled it.
 */

const ICONS: Record<string, React.ElementType> = {
  WITHDRAWAL: Banknote,
  APPLICATION: Inbox,
  REGISTRATION: UserPlus,
  SUPPORT: LifeBuoy,
  SYSTEM: Bell,
};

export interface BellRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  tone: string;
  readAt: Date | null;
  createdAt: Date;
}

export function NotificationBell({ unread, rows }: { unread: number; rows: BellRow[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Close on a click anywhere else and on Escape. Both, because a panel that
  // only closes on its own button is a panel that covers the page you wanted.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className={cn(
          "niki-press niki-focus relative flex h-[42px] w-[42px] items-center justify-center rounded-lg bg-white ring-1 transition-colors",
          open
            ? "text-niki-orange ring-niki-orange/50"
            : "text-niki-ink/70 ring-niki-edge hover:bg-niki-black/5",
        )}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-niki-orange px-1 font-figures text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-fade-up absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-niki-edge">
          <div className="flex items-center justify-between gap-3 border-b border-niki-edge px-4 py-3">
            <p className="font-display text-sm font-bold text-niki-ink">
              Notifications
              {unread > 0 ? (
                <span className="ml-1.5 font-figures text-xs font-bold text-niki-orange">
                  {unread} new
                </span>
              ) : null}
            </p>
            {unread > 0 ? (
              <form action={markAllNotificationsRead}>
                <button
                  type="submit"
                  className="niki-focus text-xs font-semibold text-niki-trust hover:underline"
                >
                  Mark all read
                </button>
              </form>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-niki-ink/50">
              Nothing has needed your attention yet.
            </p>
          ) : (
            <ul className="max-h-[22rem] divide-y divide-niki-edge overflow-y-auto">
              {rows.map((n) => {
                const Icon = ICONS[n.kind] ?? Bell;
                const isUnread = n.readAt === null;
                return (
                  <li key={n.id}>
                    <form action={openNotification}>
                      <input type="hidden" name="id" value={n.id} />
                      <button
                        type="submit"
                        className={cn(
                          "niki-focus flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-niki-surface/70",
                          isUnread ? "bg-niki-orange/[0.04]" : "",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            isUnread
                              ? (NOTIFICATION_TONES[n.tone] ?? NOTIFICATION_TONES.info)
                              : "bg-niki-surface text-niki-ink/35",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-sm",
                              isUnread
                                ? "font-semibold text-niki-ink"
                                : "font-medium text-niki-ink/60",
                            )}
                          >
                            {n.title}
                          </span>
                          {n.body ? (
                            <span className="mt-0.5 block truncate text-xs text-niki-ink/55">
                              {n.body}
                            </span>
                          ) : null}
                          <span className="mt-0.5 block text-[11px] text-niki-ink/40">
                            {formatWhen(n.createdAt)}
                          </span>
                        </span>
                        {isUnread ? (
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-niki-orange" />
                        ) : null}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}

          <ActionLink
            href="/admin/data/notifications"
            onClick={() => setOpen(false)}
            className="niki-focus block border-t border-niki-edge px-4 py-3 text-center text-xs font-semibold text-niki-trust transition-colors hover:bg-niki-surface/70"
          >
            See all notifications
          </ActionLink>
        </div>
      ) : null}
    </div>
  );
}
