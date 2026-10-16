import Link from "next/link";
import {
  AlarmClock,
  BadgeCheck,
  Check,
  Handshake,
  MessageCircle,
  PackageSearch,
  Share2,
  Sparkles,
} from "lucide-react";
import { handleFollowUp } from "@/lib/affiliate-assist-actions";
import { FOLLOW_UP_LABELS, type FollowUpItem } from "@/lib/affiliate-assist-rules";
import { cn } from "@/lib/cn";

const ICONS: Record<string, React.ElementType> = {
  reply: MessageCircle,
  relay: Share2,
  welcome: Handshake,
  delay: PackageSearch,
  delivered: BadgeCheck,
  cancelled: Sparkles,
};

function ago(since: Date, now = new Date()): string {
  const hours = Math.max(0, Math.round((now.getTime() - since.getTime()) / 3_600_000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * What this affiliate owes somebody, and a way to say it is done.
 *
 * Nothing in this list was written by anybody: each line is the orders and the
 * conversations in a state that needs a person. "Done" records only that this
 * exact state was dealt with, so a parcel that is still stuck next week asks
 * again — which is the behaviour that makes a follow-up list worth opening
 * instead of a list somebody clears once and never sees again.
 */
export function FollowUpList({
  items,
  limit,
  emptyNote = "Nothing outstanding. Every customer has had an answer and every order is moving.",
}: {
  items: FollowUpItem[];
  limit?: number;
  emptyNote?: string;
}) {
  const shown = limit ? items.slice(0, limit) : items;

  if (shown.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-4 py-10 text-center ring-1 ring-niki-edge">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-niki-success/10 text-niki-success">
          <Check className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display font-bold text-niki-ink">All clear</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-niki-ink/55">{emptyNote}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {shown.map((item) => {
        const Icon = ICONS[item.kind] ?? AlarmClock;
        return (
          <li
            key={item.key}
            className={cn(
              "flex flex-wrap items-start gap-3 rounded-2xl bg-white p-4 ring-1",
              item.urgency === "overdue" ? "ring-niki-danger/30" : "ring-niki-edge",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                item.urgency === "overdue"
                  ? "bg-niki-danger/10 text-niki-danger"
                  : "bg-niki-orange/10 text-niki-orange",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={item.href} className="font-semibold text-niki-ink hover:text-niki-orange">
                  {item.title}
                </Link>
                <span className="rounded-md bg-niki-surface px-1.5 py-0.5 text-[11px] font-semibold text-niki-ink/55">
                  {FOLLOW_UP_LABELS[item.kind]}
                </span>
                {item.urgency === "overdue" ? (
                  <span className="rounded-md bg-niki-danger/10 px-1.5 py-0.5 text-[11px] font-semibold text-niki-danger">
                    Overdue
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm text-niki-ink/60">{item.detail}</p>
              <p className="mt-1 text-[11px] text-niki-ink/40">
                {ago(item.since)}
                {item.orderNumber ? ` · ${item.orderNumber}` : ""}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={item.href}
                className="niki-press rounded-lg bg-niki-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-niki-orange-light"
              >
                Open
              </Link>
              <form action={handleFollowUp}>
                <input type="hidden" name="key" value={item.key} />
                <input type="hidden" name="kind" value={item.kind} />
                {item.orderId ? <input type="hidden" name="orderId" value={item.orderId} /> : null}
                {item.threadId ? (
                  <input type="hidden" name="followThreadId" value={item.threadId} />
                ) : null}
                <button
                  type="submit"
                  title="Takes it off the list. It comes back if nothing changes."
                  className="niki-press rounded-lg px-3 py-1.5 text-xs font-semibold text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-surface"
                >
                  Done
                </button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
