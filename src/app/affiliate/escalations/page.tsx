import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { EscalateForm } from "@/components/affiliate/EscalateForm";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import { getThreads, THREAD_FILTER_OPTIONS } from "@/lib/affiliate-assist";
import { perPageFrom } from "@/lib/data-bundles/order-filters";

export const metadata: Metadata = { title: "Nickimart enquiries — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The affiliate's own line to Nickimart, and what happened to each enquiry.
 *
 * Separate from the customer inbox because it answers a different question.
 * The inbox asks "who is waiting on me"; this asks "what am I waiting on",
 * which is what an affiliate needs when a buyer is asking them for the third
 * time and the honest answer is that Nickimart has not come back yet.
 */
export default async function AffiliateEscalationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; per?: string }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const params = await searchParams;

  const filter = THREAD_FILTER_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total } = await getThreads(affiliate.id, {
    kind: "support",
    filter,
    q: query,
    page,
    perPage,
  });
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const open = rows.filter((r) => r.status !== "resolved").length;
  const answered = rows.filter((r) => r.lastMessageRole === "support").length;

  return (
    <div>
      <ModuleHeader
        title="Nickimart enquiries"
        subtitle="Questions you've put to support, and where each one stands."
        icon={LifeBuoy}
      />

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Enquiries" value={total} />
        <StatCard label="Still open" value={open} />
        <StatCard label="Answered" value={answered} />
        <StatCard label="To pass on" value={answered} href="/affiliate/follow-ups" />
      </div>

      <div className="mt-5 rounded-2xl bg-niki-surface p-4 ring-1 ring-niki-edge">
        <EscalateForm />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search your enquiries…"
            selects={[
              { key: "status", label: "Filter by state", value: filter, options: THREAD_FILTER_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="enquiries"
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={["Subject", "About", "Order", "Priority", "State", "Last word", "When", ""]}
        minWidth={1120}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="You haven't asked Nickimart anything yet. When a customer asks something you can't answer, raise it here instead of guessing."
      >
        {rows.map((t) => (
          <ConsoleRow key={t.id}>
            <td className={td}>
              <Link
                href={`/affiliate/messages/${t.id}`}
                className={`hover:text-niki-orange ${t.unread ? "font-bold text-niki-ink" : "font-semibold text-niki-ink/80"}`}
              >
                {t.subject || "An enquiry"}
              </Link>
            </td>
            <td className={`${td} text-xs text-niki-ink/55`}>{t.topicLabel}</td>
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
              <ConsolePill status={t.priority} label={t.priority} />
            </td>
            <td className={td}>
              <ConsolePill status={t.status} label={t.statusLabel} />
            </td>
            <td className={`${td} max-w-[260px] text-xs text-niki-ink/55`}>
              <span className="block truncate" title={t.lastMessageText}>
                {t.lastMessageRole === "support" ? "Nickimart: " : "You: "}
                {t.lastMessageText || "—"}
              </span>
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
