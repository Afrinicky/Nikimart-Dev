import { AlertTriangle, CalendarClock, LayoutDashboard } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { requireMedicalStaff } from "@/lib/medical/session";
import { canSeeSection } from "@/lib/medical/roles";
import { getOverviewFigures, getUpcomingTenderDates } from "@/lib/medical/admin/overview";
import { formatPesewasShort } from "@/lib/medical/money";
import { formatDate, daysUntil } from "@/lib/medical/format";

export default async function MedicalAdminOverview() {
  const staff = await requireMedicalStaff("/medicals/admin");
  const [figures, upcoming] = await Promise.all([
    getOverviewFigures(),
    canSeeSection(staff.role, "tenders") ? getUpcomingTenderDates() : Promise.resolve([]),
  ]);

  // Cards are filtered by role, so somebody in stores is not shown a
  // receivables figure they cannot act on and have no business seeing.
  const sees = (section: string) => canSeeSection(staff.role, section);

  return (
    <div className="space-y-8">
      <ConsoleHeader
        title="Operations overview"
        subtitle="Outstanding items across sales, procurement and finance. Every figure is counted from the database."
        icon={LayoutDashboard}
      />

      {/*
        A tile links somewhere only when that somewhere exists. The quotation
        and inventory figures are real and worth reporting, but their sections
        have no screens yet, so those tiles are not links: a tile that opens a
        404 teaches people the console cannot be trusted, and Next prefetches
        the route on hover, so it fails before anybody even clicks.
      */}
      <section aria-labelledby="waiting">
        <PanelHeading title="Action required" subtitle="Counts from live records. Nothing below is an estimate." />
        <div className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
          {sees("quotations") ? (
            <StatCard
              label="New quotation requests"
              value={String(figures.quotationRequestsNew)}
              tone={figures.quotationRequestsNew > 0 ? "attention" : "default"}
            />
          ) : null}
          {sees("quotations") ? (
            <StatCard
              label="Quotations awaiting a reply"
              value={String(figures.quotationsAwaitingReply)}
              hint="Sent, not yet accepted or declined"
            />
          ) : null}
          {sees("customer-purchase-orders") ? (
            <StatCard
              label="Customer purchase orders to review"
              value={String(figures.customerPosToReview)}
              href="/medicals/admin/customer-purchase-orders?status=RECEIVED"
              tone={figures.customerPosToReview > 0 ? "attention" : "default"}
            />
          ) : null}
          {sees("tenders") ? (
            <StatCard
              label="Tender deadlines in 30 days"
              value={String(figures.tendersDueSoon)}
              href="/medicals/admin/tenders"
              tone={figures.tendersDueSoon > 0 ? "attention" : "default"}
            />
          ) : null}
          {sees("sourcing") ? (
            <StatCard
              label="Open sourcing requests"
              value={String(figures.sourcingOpen)}
              href="/medicals/admin/sourcing?status=OPEN"
            />
          ) : null}
          {sees("purchase-orders") ? (
            <StatCard
              label="Purchase orders to approve"
              value={String(figures.purchaseOrdersAwaitingApproval)}
              href="/medicals/admin/purchase-orders?status=DRAFT"
              tone={figures.purchaseOrdersAwaitingApproval > 0 ? "attention" : "default"}
            />
          ) : null}
          {sees("purchase-orders") ? (
            <StatCard
              label="Overdue deliveries"
              value={String(figures.purchaseOrdersOverdue)}
              href="/medicals/admin/purchase-orders?overdue=1"
              tone={figures.purchaseOrdersOverdue > 0 ? "attention" : "default"}
            />
          ) : null}
          {sees("payables") ? (
            <StatCard
              label="Supplier invoices with discrepancies"
              value={String(figures.invoicesWithDiscrepancies)}
              hint="Billed does not match ordered or accepted"
              href="/medicals/admin/payables?discrepancy=1"
              tone={figures.invoicesWithDiscrepancies > 0 ? "attention" : "default"}
            />
          ) : null}
        </div>
      </section>

      {sees("payables") || sees("customer-orders") ? (
        <section aria-labelledby="money">
          <PanelHeading
            title="Receivables, payables and stock"
            subtitle="Amounts owed to us and by us are reported separately — they answer different questions."
          />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sees("customer-orders") ? (
              <StatCard
                label="Outstanding from customers"
                value={formatPesewasShort(figures.outstandingReceivable)}
                hint="Across unpaid and part-paid orders"
                href="/medicals/admin/customer-orders?payment=UNPAID"
              />
            ) : null}
            {sees("payables") ? (
              <StatCard
                label="Outstanding to suppliers"
                value={formatPesewasShort(figures.outstandingPayable)}
                hint="Approved invoices not yet settled"
                href="/medicals/admin/payables?status=AWAITING_PAYMENT"
              />
            ) : null}
            {sees("inventory") ? (
              <StatCard
                label="Products at or below reorder level"
                value={String(figures.lowStockLines)}
                tone={figures.lowStockLines > 0 ? "attention" : "default"}
              />
            ) : null}
            {sees("inventory") ? (
              <StatCard
                label="Batches expiring in 90 days"
                value={String(figures.expiringBatches)}
                tone={figures.expiringBatches > 0 ? "attention" : "default"}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {sees("tenders") ? (
        <section aria-labelledby="dates">
          <PanelHeading
            title="Upcoming deadlines"
            subtitle="Tender submission deadlines and contract renewals in the next sixty days."
          />
          {upcoming.length === 0 ? (
            <div className="medi-panel mt-4 px-5 py-10 text-center">
              <p className="text-[0.875rem] text-medi-body">
                No tender deadlines or renewals in the next sixty days.
              </p>
            </div>
          ) : (
            <ul className="medi-panel mt-4 divide-y divide-medi-rule">
              {upcoming.map((tender) => {
                const deadline = tender.submissionDeadline ?? tender.renewalDueAt;
                const isRenewal = !tender.submissionDeadline && Boolean(tender.renewalDueAt);
                const days = deadline ? daysUntil(deadline) : null;
                return (
                  <li key={tender.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <span
                      className={
                        days !== null && days <= 7
                          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-medi-danger-soft text-medi-danger"
                          : "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-medi-mint-100 text-medi-teal-700"
                      }
                    >
                      {days !== null && days <= 7 ? (
                        <AlertTriangle className="h-4 w-4" aria-hidden />
                      ) : (
                        <CalendarClock className="h-4 w-4" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <MedicalLink
                        href={`/medicals/admin/tenders/${tender.id}`}
                        className="medi-focus block rounded text-[0.875rem] font-semibold text-medi-ink hover:text-medi-teal-700"
                      >
                        {tender.title}
                      </MedicalLink>
                      <p className="medi-meta mt-0.5 text-medi-muted">
                        <span className="font-figures">{tender.reference}</span> ·{" "}
                        {tender.organisation.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-figures text-[0.8125rem] font-semibold text-medi-ink">
                        {deadline ? formatDate(deadline) : "—"}
                      </p>
                      <p className="medi-meta text-medi-muted">
                        {isRenewal ? "Renewal expected" : "Submission deadline"}
                        {days !== null ? ` · ${days === 0 ? "today" : `${days}d`}` : ""}
                      </p>
                    </div>
                    <StatusBadge
                      label={tender.status.replace(/_/g, " ").toLowerCase()}
                      tone={days !== null && days <= 7 ? "bad" : "progress"}
                      className="capitalize"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
