import {
  Banknote,
  Bell,
  CheckCheck,
  ChevronRight,
  Inbox,
  LifeBuoy,
  Undo2,
  UserPlus,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { formatWhen } from "@/components/agent/AgentUi";
import { NOTIFICATION_TONES } from "@/lib/data-bundles/notification-rules";
import {
  markNotificationRead,
  markNotificationUnread,
} from "@/lib/data-bundles/notification-actions";
import { cn } from "@/lib/cn";

/**
 * Everything the platform has told the admins, newest first.
 *
 * A list rather than a table, because a notification is a sentence: the thing
 * that happened, where it leads, and whether anybody has dealt with it. The
 * columns a table would give it — kind, tone, time — are all short enough to
 * sit in the line itself.
 *
 * Unread carries the accent; read fades back. The one-click read is the row's
 * own, not the page's, so clearing a queue never means clearing something you
 * have not looked at.
 */

const ICONS: Record<string, React.ElementType> = {
  WITHDRAWAL: Banknote,
  APPLICATION: Inbox,
  REGISTRATION: UserPlus,
  SUPPORT: LifeBuoy,
  SYSTEM: Bell,
};

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  tone: string;
  readAt: Date | null;
  readBy?: string;
  createdAt: Date;
}

export function NotificationsList({
  rows,
  emptyHint,
}: {
  rows: NotificationRow[];
  emptyHint: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
          <Bell className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display font-bold text-niki-ink">Nothing here</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/55">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-niki-edge">
      {rows.map((n) => {
        const Icon = ICONS[n.kind] ?? Bell;
        const unread = n.readAt === null;
        return (
          <li key={n.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
            <span
              className={cn(
                "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                unread
                  ? (NOTIFICATION_TONES[n.tone] ?? NOTIFICATION_TONES.info)
                  : "bg-niki-surface text-niki-ink/35",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p
                  className={cn(
                    "text-sm",
                    unread ? "font-semibold text-niki-ink" : "font-medium text-niki-ink/60",
                  )}
                >
                  {n.title}
                </p>
                {unread ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-niki-orange" />
                ) : null}
              </div>
              {n.body ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-niki-ink/55">{n.body}</p>
              ) : null}
              <p className="mt-1 text-[11px] text-niki-ink/40">
                {formatWhen(n.createdAt)}
                {!unread && n.readBy ? ` · read by ${n.readBy}` : ""}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <form action={unread ? markNotificationRead : markNotificationUnread}>
                <input type="hidden" name="id" value={n.id} />
                <button
                  type="submit"
                  title={unread ? "Mark read" : "Put back in the queue"}
                  aria-label={unread ? "Mark read" : "Put back in the queue"}
                  className="niki-press niki-focus flex h-8 w-8 items-center justify-center rounded-lg text-niki-ink/40 transition-colors hover:bg-niki-surface hover:text-niki-ink"
                >
                  {unread ? <CheckCheck className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
                </button>
              </form>
              {n.href ? (
                <ActionLink
                  href={n.href}
                  title="Open it"
                  aria-label="Open it"
                  className="niki-focus flex h-8 w-8 items-center justify-center rounded-lg text-niki-ink/40 transition-colors hover:bg-niki-surface hover:text-niki-orange"
                >
                  <ChevronRight className="h-4 w-4" />
                </ActionLink>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
