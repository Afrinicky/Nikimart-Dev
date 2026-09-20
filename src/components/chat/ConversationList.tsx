import {
  Headphones,
  Lock,
  MessageSquare,
  Radio,
  Users,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { formatWhen } from "@/components/agent/AgentUi";
import { CONVERSATION_LABELS, type ConversationKind } from "@/lib/chat/identity";
import { cn } from "@/lib/cn";

/**
 * A list of rooms, wherever rooms are listed.
 *
 * Read the way an inbox is read: who it is with, the last thing said, and how
 * long ago — with anything unread carrying weight rather than a badge alone,
 * because a count you have to hunt for is a count you miss.
 */

const ICONS: Record<string, React.ElementType> = {
  SUPPORT: Headphones,
  GROUP: Users,
  TEAM: Users,
  SESSION: Radio,
  DIRECT: MessageSquare,
};

const TONES: Record<string, string> = {
  SUPPORT: "bg-amber-100 text-amber-700",
  GROUP: "bg-niki-trust/12 text-niki-trust",
  TEAM: "bg-niki-orange/12 text-niki-orange",
  SESSION: "bg-niki-success/12 text-niki-success",
  DIRECT: "bg-niki-ink/8 text-niki-ink/60",
};

export interface ConversationCard {
  id: string;
  kind: string;
  title: string;
  status: string;
  preview: string;
  unread: number;
  memberCount: number;
  lastMessageAt: Date | null;
}

export function ConversationList({
  rows,
  basePath,
  empty,
}: {
  rows: ConversationCard[];
  basePath: string;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-4 py-14 text-center ring-1 ring-niki-edge">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/30">
          <MessageSquare className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display font-bold text-niki-ink">Nothing here</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/55">{empty}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((c) => {
        const Icon = ICONS[c.kind] ?? MessageSquare;
        const unread = c.unread > 0;
        return (
          <li key={c.id}>
            <ActionLink
              href={`${basePath}/${c.id}`}
              className={cn(
                "niki-focus group flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 transition-colors",
                unread ? "ring-niki-orange/35 hover:ring-niki-orange/60" : "ring-niki-edge hover:ring-niki-orange/40",
              )}
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  TONES[c.kind] ?? TONES.DIRECT,
                )}
              >
                <Icon className="h-5 w-5" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      unread ? "font-bold text-niki-ink" : "font-semibold text-niki-ink/85",
                    )}
                  >
                    {c.title || CONVERSATION_LABELS[c.kind as ConversationKind] || "Room"}
                  </span>
                  {c.status === "closed" ? (
                    <Lock className="h-3 w-3 shrink-0 text-niki-ink/30" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-xs",
                    unread ? "font-medium text-niki-ink/70" : "text-niki-ink/45",
                  )}
                >
                  {c.preview || "No messages yet"}
                </span>
              </span>

              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[11px] text-niki-ink/40">
                  {c.lastMessageAt ? formatWhen(c.lastMessageAt) : ""}
                </span>
                {unread ? (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-niki-orange px-1.5 font-figures text-[11px] font-bold text-white">
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                ) : (
                  <span className="text-[11px] text-niki-ink/35">
                    {c.memberCount > 2 ? `${c.memberCount} people` : ""}
                  </span>
                )}
              </span>
            </ActionLink>
          </li>
        );
      })}
    </ul>
  );
}
