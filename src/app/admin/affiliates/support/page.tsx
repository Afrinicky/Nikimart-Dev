import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { requireDashboard } from "@/lib/session";
import {
  getSupportQueue,
  SUPPORT_PRIORITY_OPTIONS,
  SUPPORT_QUEUE_OPTIONS,
} from "@/lib/affiliate-assist";
import { perPageFrom } from "@/lib/data-bundles/order-filters";

export const metadata: Metadata = { title: "Affiliate enquiries — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What affiliates have asked Nickimart.
 *
 * This queue is the price of letting affiliates look after their buyers, and
 * it is worth paying: the alternative is an affiliate guessing at stock and
 * delivery dates in a WhatsApp thread nobody here can see. Every answer given
 * here can be passed to the customer marked as Nickimart's, which is what
 * makes the difference between a relayed fact and a rumour.
 *
 * Ordered by priority then by the longest wait, because somebody on the other
 * end has a customer asking them again.
 */
export default async function AdminAffiliateSupportPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const status = SUPPORT_QUEUE_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "open";
  const priority = SUPPORT_PRIORITY_OPTIONS.some((o) => o.value === params.priority)
    ? params.priority!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total, open, urgent } = await getSupportQueue({
    status,
    priority,
    q: query,
    page,
    perPage,
  });
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const stale = rows.filter((r) => r.status !== "resolved" && r.waitingHours >= 24).length;

  return (
    <Container className="py-8">
      <AffiliateModuleHeader />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Needs an answer" value={open} href="/admin/affiliates/support?status=open" />
        <StatCard
          label="Urgent"
          value={urgent}
          href="/admin/affiliates/support?status=open&priority=urgent"
        />
        <StatCard label="Waiting over a day" value={stale} />
        <StatCard label="On this filter" value={total} />
      </div>

      <PanelHeading
        title="Enquiries"
        subtitle="Questions affiliates can't answer for their customers without us."
      />

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search by affiliate, subject or order number…"
            selects={[
              { key: "status", label: "Filter by state", value: status, options: SUPPORT_QUEUE_OPTIONS },
              {
                key: "priority",
                label: "Filter by priority",
                value: priority,
                options: SUPPORT_PRIORITY_OPTIONS,
              },
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
        columns={["Affiliate", "Subject", "About", "Order", "Priority", "State", "Waiting", "Last word", ""]}
        minWidth={1240}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="Nothing waiting. Affiliates raise an enquiry here when a customer asks them something only we can answer."
      >
        {rows.map((t) => (
          <ConsoleRow key={t.id}>
            <td className={td}>
              <Link
                href={`/admin/affiliates/${t.affiliateId}`}
                className="font-semibold text-niki-ink hover:text-niki-orange"
              >
                {t.affiliateName}
              </Link>
              <span className="block font-mono text-[11px] text-niki-ink/40">{t.affiliateCode}</span>
            </td>
            <td className={td}>
              <Link
                href={`/admin/affiliates/support/${t.id}`}
                className={`hover:text-niki-orange ${t.unread ? "font-bold text-niki-ink" : "font-semibold text-niki-ink/80"}`}
              >
                {t.subject || "An enquiry"}
              </Link>
            </td>
            <td className={`${td} text-xs text-niki-ink/55`}>{t.topicLabel}</td>
            <td className={`${td} font-mono text-xs text-niki-ink/60`}>{t.orderNumber ?? "—"}</td>
            <td className={td}>
              <ConsolePill status={t.priority} label={t.priority} />
            </td>
            <td className={td}>
              <ConsolePill status={t.status} label={t.statusLabel} />
            </td>
            <td className={`${td} whitespace-nowrap text-xs`}>
              {t.status === "resolved" ? (
                <span className="text-niki-ink/40">—</span>
              ) : (
                <span
                  className={
                    t.waitingHours >= 24 ? "font-semibold text-niki-danger" : "text-niki-ink/55"
                  }
                >
                  {t.waitingHours < 1 ? "just now" : `${t.waitingHours}h`}
                </span>
              )}
            </td>
            <td className={`${td} max-w-[240px] text-xs text-niki-ink/55`}>
              <span className="block truncate" title={t.lastMessageText}>
                {t.lastMessageRole === "support" ? "Us: " : "Them: "}
                {t.lastMessageText || "—"}
              </span>
            </td>
            <td className={td}>
              <Link
                href={`/admin/affiliates/support/${t.id}`}
                className="niki-press rounded-lg bg-niki-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-niki-orange-light"
              >
                Answer
              </Link>
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>

      <p className="mt-4 text-xs text-niki-ink/45">
        {formatWhen(new Date())} · Affiliates see the answer and can pass it to their customer
        marked as confirmed by Nickimart.
      </p>
    </Container>
  );
}
