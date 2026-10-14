import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldAlert } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { FlagDecision } from "@/components/admin/AffiliateAdminTools";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { requireDashboard } from "@/lib/session";
import {
  EVENT_LABELS,
  FLAG_KIND_LABELS,
  FLAG_STATUS_OPTIONS,
  getAffiliateEvents,
  getFraudFlags,
} from "@/lib/affiliate-admin";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { perPageFrom } from "@/lib/data-bundles/order-filters";

export const metadata: Metadata = { title: "Affiliate abuse — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const SEVERITY_LABELS: Record<string, string> = {
  block: "Blocked the commission",
  warn: "Let through, flagged",
  info: "Noted",
};

/**
 * What the attribution engine refused, and what it let through uneasily.
 *
 * Two kinds of row. A blocking signal — a self-referral, a closed window, a
 * suspended account — stopped the commission from accruing at all, and is here
 * so that "why did this order not pay me" always has an answer. A warning let
 * it through and asked for a human: matching contact details, an unusual number
 * of orders from one buyer. Upholding a flag does not itself suspend anybody or
 * take money back; those are separate, deliberate acts.
 */
export default async function AdminAffiliateFraudPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; per?: string }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const status = FLAG_STATUS_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "open";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [policy, { rows, total, open }, events] = await Promise.all([
    getAffiliatePolicy(),
    getFraudFlags({ status, q: query, page, perPage }),
    getAffiliateEvents(undefined, 20),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <Container className="py-8">
      <AffiliateModuleHeader />

      <div className="mt-6">
        <PanelHeading
          title="Abuse & attribution refusals"
          subtitle="Everything the engine stopped, and everything it was unsure about."
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Needing a look" value={open} href="/admin/affiliates/fraud?status=open" />
        <StatCard label="Shown" value={total.toLocaleString("en-GB")} />
        <StatCard
          label="Self-referrals"
          value={policy.blockSelfReferral ? "Blocked" : "Allowed"}
          href="/admin/affiliates/settings"
        />
        <StatCard
          label="Orders per buyer per day"
          value={policy.maxOrdersPerVisitorPerDay > 0 ? policy.maxOrdersPerVisitorPerDay : "No cap"}
          href="/admin/affiliates/settings"
        />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search by affiliate, code or kind…"
            selects={[{ key: "status", label: "Filter by state", value: status, options: FLAG_STATUS_OPTIONS }]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="flags"
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={["Raised", "Affiliate", "Order", "What happened", "Effect", "Detail", "State", "Actions"]}
        minWidth={1300}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty={
          status === "open"
            ? "Nothing to look at. The engine raises a flag here the moment something looks wrong."
            : "No flags match these filters."
        }
      >
        {rows.map((f) => (
          <ConsoleRow key={f.id}>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {formatWhen(f.createdAt)}
            </td>
            <td className={td}>
              <Link
                href={`/admin/affiliates/${f.affiliateId}`}
                className="font-semibold text-niki-ink hover:text-niki-orange"
              >
                {f.affiliateName}
              </Link>
              <span className="block font-mono text-[11px] text-niki-orange">{f.affiliateCode}</span>
            </td>
            <td className={`${td} font-mono text-xs`}>
              {f.orderId ? (
                <Link href={`/admin/orders/${f.orderId}`} className="text-niki-ink hover:text-niki-orange">
                  {f.orderNumber ?? "View"}
                </Link>
              ) : (
                <span className="text-niki-ink/35">—</span>
              )}
            </td>
            <td className={`${td} text-xs font-semibold text-niki-ink`}>
              {FLAG_KIND_LABELS[f.kind] ?? f.kind}
            </td>
            <td className={td}>
              <ConsolePill
                status={f.severity === "block" ? "reversed" : f.severity === "warn" ? "clearing" : "paused"}
                label={SEVERITY_LABELS[f.severity] ?? f.severity}
              />
            </td>
            <td className={`${td} max-w-[280px] text-xs leading-relaxed text-niki-ink/60`}>
              {f.detail || "—"}
            </td>
            <td className={td}>
              <ConsolePill
                status={f.status === "upheld" ? "reversed" : f.status === "cleared" ? "cleared" : "pending"}
                label={f.status === "upheld" ? "Upheld" : f.status === "cleared" ? "Cleared" : "Open"}
              />
            </td>
            <td className={td}>
              <FlagDecision id={f.id} status={f.status} />
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-niki-ink/50">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        A blocking flag means the order earned nothing. A warning means it did, and somebody should
        look. To act on one, suspend the affiliate from the roster or reverse the commission from
        the Commissions tab — both leave their own record.
      </p>

      <section className="mt-8">
        <PanelHeading title="Recent activity" subtitle="Everything done to the programme, newest first." />
        {events.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-niki-ink/55 ring-1 ring-niki-edge">
            Nothing recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-niki-edge rounded-2xl bg-white ring-1 ring-niki-edge">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold text-niki-ink">
                    {EVENT_LABELS[e.action] ?? e.action}
                  </span>
                  {e.affiliate?.name ? (
                    <span className="text-niki-ink/55"> · {e.affiliate.name}</span>
                  ) : null}
                  {e.detail ? (
                    <span className="block truncate text-[11px] text-niki-ink/45">{e.detail}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-niki-ink/45">
                  {e.actorName || "System"} · {formatWhen(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
