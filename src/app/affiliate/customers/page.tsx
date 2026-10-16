import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import { CUSTOMER_FILTER_OPTIONS, getAssistCustomers } from "@/lib/affiliate-assist";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "My customers — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The people this affiliate's links have reached, by name.
 *
 * Two kinds in one list. Somebody who clicked and signed in is a prospect: you
 * know what they looked at and nothing else happened. Somebody who bought is a
 * customer, and the relationship is the thing that produces the second order.
 *
 * Clicks from a visitor who never signed in cannot be here — there is nobody
 * to name and nobody to write to — so the count is printed instead of leaving
 * an affiliate to wonder why four hundred clicks produced eleven names.
 */
export default async function AffiliateCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; per?: string }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const params = await searchParams;

  const filter = CUSTOMER_FILTER_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total, anonymousClicks } = await getAssistCustomers(affiliate.id, {
    filter,
    q: query,
    page,
    perPage,
  });
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const buyers = rows.filter((r) => r.kind === "buyer").length;
  const waiting = rows.filter((r) => r.unread).length;

  return (
    <div>
      <ModuleHeader
        title="My customers"
        subtitle="Everyone your links brought in — and the ones who still need an answer."
        icon={Users}
      >
        <Link
          href="/affiliate/messages"
          className="niki-press rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          All messages
        </Link>
      </ModuleHeader>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="People" value={total.toLocaleString("en-GB")} />
        <StatCard label="Bought something" value={buyers} href="/affiliate/customers?status=buyer" />
        <StatCard label="Waiting on you" value={waiting} href="/affiliate/customers?status=unread" />
        <StatCard
          label="Anonymous clicks"
          value={anonymousClicks.toLocaleString("en-GB")}
          href="/affiliate/links"
        />
      </div>

      {anonymousClicks > 0 ? (
        <p className="mt-4 rounded-xl bg-white px-4 py-3 text-xs text-niki-ink/55 ring-1 ring-niki-edge">
          {anonymousClicks.toLocaleString("en-GB")} visits came from people who never signed in.
          There is no name or contact behind those, so they can&apos;t be written to — they show up
          here only once they create an account or order.
        </p>
      ) : null}

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search by name…"
            selects={[
              { key: "status", label: "Filter by kind", value: filter, options: CUSTOMER_FILTER_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="people"
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={["Who", "Kind", "Orders", "Bought", "First seen", "Last order", "Last message", ""]}
        minWidth={1120}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="Nobody yet. Share a product — the people who click and sign in appear here, and so does everybody who buys."
      >
        {rows.map((r) => (
          <ConsoleRow key={r.userId}>
            <td className={td}>
              <div className="flex items-center gap-2">
                {r.unread ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-niki-orange"
                    title="Waiting on your reply"
                    aria-label="Waiting on your reply"
                  />
                ) : (
                  <span className="h-2 w-2 shrink-0" />
                )}
                <Link
                  href={`/affiliate/customers/${r.userId}`}
                  className={`hover:text-niki-orange ${r.unread ? "font-bold text-niki-ink" : "font-semibold text-niki-ink/80"}`}
                >
                  {r.name}
                </Link>
              </div>
            </td>
            <td className={td}>
              <ConsolePill
                status={r.kind === "buyer" ? "live" : "paused"}
                label={r.kind === "buyer" ? "Customer" : "Clicked only"}
              />
            </td>
            <td className={`${td} font-semibold text-niki-ink`}>{r.orders}</td>
            <td className={`${td} font-figures font-bold text-niki-ink`}>
              {r.spend > 0 ? formatPrice(r.spend) : "—"}
            </td>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {formatWhen(r.firstSeenAt)}
            </td>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {formatWhen(r.lastOrderAt)}
            </td>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {r.lastContactAt ? formatWhen(r.lastContactAt) : "Never"}
            </td>
            <td className={td}>
              <Link
                href={r.threadId ? `/affiliate/messages/${r.threadId}` : `/affiliate/customers/${r.userId}`}
                className="niki-press rounded-lg px-3 py-1.5 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-niki-surface"
              >
                {r.threadId ? "Open chat" : "Say hello"}
              </Link>
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>
    </div>
  );
}
