import type { Metadata } from "next";
import { Suspense } from "react";
import { Wallet } from "lucide-react";
import { ModuleHeader, PanelHeading } from "@/components/admin/ModuleHeader";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { RequestPayoutForm } from "@/components/affiliate/RequestPayoutForm";
import { CancelPayoutButton } from "@/components/affiliate/CancelPayoutButton";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActionLink } from "@/components/ui/motion";
import {
  PAYOUT_STATUS_OPTIONS,
  getAffiliateBalance,
  getAffiliatePayouts,
  requireAffiliateConsole,
} from "@/lib/affiliate-console";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Earnings — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

const PAYOUT_LABELS: Record<string, string> = {
  pending: "Awaiting review",
  processing: "Processing",
  paid: "Paid",
  rejected: "Declined",
};

/**
 * What an affiliate is owed, and how they get it.
 *
 * The four states a commission can be in are shown as four separate figures,
 * because collapsing them into one "balance" is what generates support
 * tickets: somebody who sees GH₵400 and can only withdraw GH₵80 assumes a
 * fault. Each tile says what the money is waiting on.
 */
export default async function AffiliateEarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; per?: string }>;
}) {
  const { affiliate, policy } = await requireAffiliateConsole();
  const params = await searchParams;

  const status = PAYOUT_STATUS_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [balance, { rows, total }] = await Promise.all([
    getAffiliateBalance(affiliate.id),
    getAffiliatePayouts(affiliate.id, { status, q: query, page, perPage }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const openRequest = rows.some((r) => r.status === "pending" || r.status === "processing");

  return (
    <div>
      <ModuleHeader
        title="Earnings & payouts"
        subtitle="What you've earned, what has cleared, and what we've paid you."
        icon={Wallet}
      />

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Earned all time" value={formatMoney(balance.earned)} href="/affiliate/commissions" />
        <StatCard
          label="Awaiting delivery"
          value={formatMoney(balance.pending)}
          href="/affiliate/commissions?status=pending"
        />
        <StatCard
          label="In return window"
          value={formatMoney(balance.clearing)}
          href="/affiliate/commissions?status=clearing"
        />
        <StatCard label="Available" value={formatMoney(balance.available)} />
        <StatCard label="Requested" value={formatMoney(balance.requested)} />
        <StatCard label="Paid out" value={formatMoney(balance.paid)} />
      </div>

      {balance.team > 0 || balance.registrationOwed > 0 ? (
        <p className="mt-4 rounded-2xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/65">
          {balance.team > 0 ? (
            <>
              {formatMoney(balance.team)} of this is what your team earned you.{" "}
              <ActionLink href="/affiliate/team" className="font-semibold text-niki-orange hover:underline">
                See your team
              </ActionLink>
              {balance.registrationOwed > 0 ? " " : "."}
            </>
          ) : null}
          {balance.registrationOwed > 0 ? (
            <>
              {formatMoney(balance.registrationOwed)} of your registration fee is still clearing,
              and is held back from what you can withdraw until it is settled.
            </>
          ) : null}
        </p>
      ) : null}

      <section className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <PanelHeading
          title="Request a payout"
          subtitle={`Commission clears ${
            policy.returnWindowDays > 0
              ? `${policy.returnWindowDays} day${policy.returnWindowDays === 1 ? "" : "s"} after delivery`
              : "on delivery"
          }. ${formatMoney(balance.pending + balance.clearing)} is still waiting.`}
        />
        <RequestPayoutForm
          available={balance.available}
          minimum={policy.minPayout}
          fee={policy.payoutFee}
          hasPayoutDetails={Boolean(affiliate.payoutNumber)}
          openRequest={openRequest}
        />
      </section>

      <div className="mt-6">
        <PanelHeading title="Payout history" subtitle="Every request and where it got to." />
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search by reference…"
            selects={[{ key: "status", label: "Filter by status", value: status, options: PAYOUT_STATUS_OPTIONS }]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="payouts"
          />
        </Suspense>

        <ConsoleTable
          columns={["Requested", "Amount", "Method", "Paid to", "Lines", "Status", "Settled", "Reference", ""]}
          minWidth={1100}
          page={page}
          pageCount={pageCount}
          perPage={perPage}
          empty="No payout requests yet."
        >
          {rows.map((p) => (
            <ConsoleRow key={p.id}>
              <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
                {formatWhen(p.createdAt)}
              </td>
              <td className={`${td} font-figures font-bold text-niki-ink`}>{formatMoney(p.amount)}</td>
              <td className={`${td} text-xs text-niki-ink/65`}>{p.method || "—"}</td>
              <td className={`${td} text-xs text-niki-ink/65`}>
                {p.accountNumber ? (
                  <>
                    <span className="font-mono">{p.accountNumber}</span>
                    {p.accountName ? (
                      <span className="block text-[11px] text-niki-ink/45">{p.accountName}</span>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className={`${td} text-niki-ink/70`}>{p.lines || "—"}</td>
              <td className={td}>
                <ConsolePill
                  status={p.status}
                  label={PAYOUT_LABELS[p.status] ?? p.status}
                  title={p.status === "rejected" ? p.rejectReason || undefined : undefined}
                />
              </td>
              <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
                {p.paidAt ? formatWhen(p.paidAt) : "—"}
              </td>
              <td className={`${td} font-mono text-[11px] text-niki-ink/45`}>{p.reference || "—"}</td>
              <td className={td}>
                {p.status === "pending" ? <CancelPayoutButton id={p.id} /> : null}
              </td>
            </ConsoleRow>
          ))}
        </ConsoleTable>
      </div>

      <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <PanelHeading title="Where your payouts go" />
        {affiliate.payoutNumber ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-niki-ink/45">Method</dt>
              <dd className="mt-0.5 font-semibold text-niki-ink">
                {affiliate.payoutMethod === "bank" ? "Bank transfer" : "Mobile Money"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-niki-ink/45">Account</dt>
              <dd className="mt-0.5 font-mono font-semibold text-niki-ink">
                {affiliate.payoutNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-niki-ink/45">Name</dt>
              <dd className="mt-0.5 font-semibold text-niki-ink">
                {affiliate.payoutName || "—"}
                {affiliate.payoutNetwork ? (
                  <span className="ml-1.5 text-xs font-medium text-niki-ink/50">
                    {affiliate.payoutNetwork}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-niki-ink/60">
            No payout details on file yet — add them in Settings.
          </p>
        )}
      </section>
    </div>
  );
}
