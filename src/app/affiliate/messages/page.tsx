import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import {
  getAssistSummary,
  getThreads,
  THREAD_FILTER_OPTIONS,
  THREAD_KIND_OPTIONS,
} from "@/lib/affiliate-assist";
import { perPageFrom } from "@/lib/data-bundles/order-filters";

export const metadata: Metadata = { title: "Messages — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Every conversation this affiliate is part of, in one list.
 *
 * Customers and Nickimart together rather than in two inboxes, because the
 * work alternates between them: a buyer asks, support is asked, the answer
 * comes back, the buyer is told. Splitting them would mean checking two
 * screens to find out whether anything is outstanding.
 */
export default async function AffiliateMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string; q?: string; page?: string; per?: string }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const params = await searchParams;

  const kind = THREAD_KIND_OPTIONS.some((o) => o.value === params.kind) ? params.kind! : "all";
  const filter = THREAD_FILTER_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [{ rows, total }, summary] = await Promise.all([
    getThreads(affiliate.id, { kind, filter, q: query, page, perPage }),
    getAssistSummary(affiliate.id),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>
      <ModuleHeader
        title="Messages"
        subtitle="Your customers, and your enquiries with Nickimart."
        icon={MessagesSquare}
      >
        <Link
          href="/affiliate/customers"
          className="niki-press rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          Find a customer
        </Link>
      </ModuleHeader>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Unread" value={summary.unread} href="/affiliate/messages?status=unread" />
        <StatCard label="Needs your reply" value={summary.waiting} href="/affiliate/messages?status=mine" />
        <StatCard label="With Nickimart" value={summary.escalations} href="/affiliate/escalations" />
        <StatCard label="Outstanding actions" value={summary.followUps} href="/affiliate/follow-ups" />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search by name, order number or message…"
            selects={[
              { key: "kind", label: "Filter by who", value: kind, options: THREAD_KIND_OPTIONS },
              { key: "status", label: "Filter by state", value: filter, options: THREAD_FILTER_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="conversations"
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={["Who", "About", "Last message", "Order", "State", "When", ""]}
        minWidth={1080}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="No conversations yet. Open a referred order and say hello to the buyer — it is the single thing that turns one sale into the next."
      >
        {rows.map((t) => (
          <ConsoleRow key={t.id}>
            <td className={td}>
              <div className="flex items-center gap-2">
                {t.unread ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-niki-orange"
                    title="Unread"
                    aria-label="Unread"
                  />
                ) : (
                  <span className="h-2 w-2 shrink-0" />
                )}
                <Link
                  href={`/affiliate/messages/${t.id}`}
                  className={`hover:text-niki-orange ${t.unread ? "font-bold text-niki-ink" : "font-semibold text-niki-ink/80"}`}
                >
                  {t.who}
                </Link>
              </div>
            </td>
            <td className={`${td} text-xs text-niki-ink/65`}>
              <span className="block max-w-[220px] truncate">{t.subject || t.topicLabel}</span>
              <span className="text-[11px] text-niki-ink/40">{t.topicLabel}</span>
            </td>
            <td className={`${td} max-w-[300px] text-xs text-niki-ink/55`}>
              <span className="block truncate" title={t.lastMessageText}>
                {t.lastMessageText || "—"}
              </span>
            </td>
            <td className={`${td} font-mono text-xs text-niki-ink/60`}>
              {t.orderId && t.orderNumber ? (
                <Link href={`/affiliate/orders/${t.orderId}`} className="hover:text-niki-orange">
                  {t.orderNumber}
                </Link>
              ) : (
                "—"
              )}
            </td>
            <td className={td}>
              <ConsolePill status={t.status} label={t.statusLabel} />
            </td>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {formatWhen(t.lastMessageAt ?? t.createdAt)}
            </td>
            <td className={td}>
              <Link
                href={`/affiliate/messages/${t.id}`}
                className="niki-press rounded-lg px-3 py-1.5 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-niki-surface"
              >
                Open
              </Link>
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>
    </div>
  );
}
