import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { FollowUpList } from "@/components/affiliate/FollowUpList";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import { getAssistSummary, getFollowUps } from "@/lib/affiliate-assist";
import { FOLLOW_UP_LABELS, type FollowUpKind } from "@/lib/affiliate-assist-rules";

export const metadata: Metadata = { title: "Follow-ups — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What this affiliate owes somebody today.
 *
 * Nothing on this screen was typed in by anybody. Each line is the orders and
 * the conversations in a state that needs a person — a buyer who wrote and has
 * had no answer, a parcel that has not moved in a week, an answer from
 * Nickimart nobody has passed on, a delivery nobody checked. That is also why
 * "Done" is not permanent: it records that this state was dealt with, so a
 * parcel still stuck next week asks again.
 */
export default async function AffiliateFollowUpsPage() {
  const { affiliate } = await requireAffiliateConsole();
  const [board, summary] = await Promise.all([
    getFollowUps(affiliate.id),
    getAssistSummary(affiliate.id),
  ]);

  const counts = new Map<string, number>();
  for (const item of board.items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);

  return (
    <div>
      <ModuleHeader
        title="Follow-ups"
        subtitle="Everything waiting on you, worked out from your orders and conversations."
        icon={ClipboardCheck}
      >
        <Link
          href="/affiliate/messages"
          className="niki-press rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          All messages
        </Link>
      </ModuleHeader>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Outstanding" value={board.items.length} />
        <StatCard label="Overdue" value={board.overdue} />
        <StatCard label="Unread messages" value={summary.unread} href="/affiliate/messages?status=unread" />
        <StatCard label="People you help" value={summary.people} href="/affiliate/customers" />
      </div>

      {counts.size > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {[...counts.entries()].map(([kind, n]) => (
            <li
              key={kind}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-niki-ink/65 ring-1 ring-niki-edge"
            >
              {FOLLOW_UP_LABELS[kind as FollowUpKind] ?? kind}
              <span className="ml-1.5 text-niki-orange">{n}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4">
        <FollowUpList items={board.items} />
      </div>
    </div>
  );
}
