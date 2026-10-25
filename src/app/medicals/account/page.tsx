import type { Metadata } from "next";
import { Heart, LogOut } from "lucide-react";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { StatusChip } from "@/components/medical/ui/StatusChip";
import { AccountPanel, AccountRow } from "@/components/medical/account/AccountRow";
import { NotConfigured } from "@/components/medical/ui/NotConfigured";
import { isMedicalConfigured } from "@/lib/medical/db";
import { requireMedicalCustomer } from "@/lib/medical/customer";
import { getAccountSummary } from "@/lib/medical/account/queries";
import {
  ORDER_FULFILMENT_LABELS,
  ORDER_PAYMENT_LABELS,
  QUOTATION_LABELS,
  REQUEST_LABELS,
} from "@/lib/medical/account/status-labels";
import { medicalDb } from "@/lib/medical/db";
import { formatPesewas } from "@/lib/medical/money";
import { formatDate } from "@/lib/medical/format";
import { logoutAction } from "@/lib/auth-actions";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

/**
 * What a customer has going with this business, on one page.
 *
 * Three records in the order they happen — a request, the quotation that
 * answers it, the order that follows — plus the things they have saved and the
 * details printed on their documents. Each section says plainly when it is
 * empty rather than showing a zero in a tile: a dashboard of noughts is a
 * dashboard that tells a first-time customer nothing.
 */
export default async function MedicalAccountPage() {
  if (!isMedicalConfigured()) return <NotConfigured />;

  const customer = await requireMedicalCustomer("/medicals/account");
  const [summary, savedCount, organisation] = await Promise.all([
    getAccountSummary(customer.customerId),
    medicalDb.wishlistItem
      .count({ where: { customerId: customer.customerId } })
      .catch(() => 0),
    customer.organisationId
      ? medicalDb.organisation
          .findUnique({ where: { id: customer.organisationId }, select: { name: true } })
          .catch(() => null)
      : null,
  ]);

  return (
    <div className="mx-auto max-w-[80rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs trail={[{ href: "/medicals", label: "Home" }, { label: "Account" }]} />

      <header className="mt-6">
        <h1 className="medi-h1 text-medi-ink">Your account</h1>
        <p className="medi-lede mt-2.5 text-medi-body">
          Signed in as {customer.name || customer.email}.
        </p>
      </header>

      <div className="mt-8 gap-10 lg:grid lg:grid-cols-[1fr_19rem] lg:items-start">
        <div className="min-w-0 space-y-9">
          <AccountPanel
            title="Quotation requests"
            action={
              <MedicalLink
                href="/medicals/quotations/new"
                className="medi-focus medi-label rounded-md text-medi-teal-700 hover:text-medi-teal-800"
              >
                Request a quotation
              </MedicalLink>
            }
            isEmpty={summary.requests.length === 0}
            empty={
              <>
                <p className="medi-prose text-medi-body">
                  Nothing requested yet. Build a quotation list as you browse, then send
                  it in one request — including anything you cannot find in the catalogue.
                </p>
                <MedicalButtonLink href="/medicals/quotations/new" className="mt-4">
                  Request a quotation
                </MedicalButtonLink>
              </>
            }
          >
            {summary.requests.map((request) => (
              <AccountRow
                key={request.id}
                href={`/medicals/quotations/${request.accessToken}`}
                reference={request.reference}
                meta={`${request.lineCount} ${request.lineCount === 1 ? "line" : "lines"} · sent ${formatDate(request.submittedAt)}${
                  request.quotationCount > 0
                    ? ` · ${request.quotationCount} ${request.quotationCount === 1 ? "quotation" : "quotations"}`
                    : ""
                }`}
                status={<StatusChip entry={REQUEST_LABELS[request.status as never]} />}
              />
            ))}
          </AccountPanel>

          <AccountPanel
            title="Quotations"
            isEmpty={summary.quotations.length === 0}
            empty={
              <p className="medi-prose text-medi-body">
                A quotation appears here once we have priced one of your requests.
              </p>
            }
          >
            {summary.quotations.map((quotation) => (
              <AccountRow
                key={quotation.id}
                href={
                  quotation.requestToken
                    ? `/medicals/quotations/${quotation.requestToken}`
                    : undefined
                }
                reference={`${quotation.reference}${quotation.version > 1 ? ` v${quotation.version}` : ""}`}
                meta={[
                  quotation.issuedAt ? `issued ${formatDate(quotation.issuedAt)}` : null,
                  quotation.validUntil ? `valid until ${formatDate(quotation.validUntil)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                amount={formatPesewas(quotation.total)}
                status={<StatusChip entry={QUOTATION_LABELS[quotation.status as never]} />}
              />
            ))}
          </AccountPanel>

          <AccountPanel
            title="Orders"
            isEmpty={summary.orders.length === 0}
            empty={
              <p className="medi-prose text-medi-body">
                No orders yet. Anything you buy or accept a quotation for is listed here.
              </p>
            }
          >
            {summary.orders.map((order) => (
              <AccountRow
                key={order.id}
                reference={order.reference}
                meta={[
                  `placed ${formatDate(order.placedAt)}`,
                  order.outstanding > 0 ? `${formatPesewas(order.outstanding)} outstanding` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                amount={formatPesewas(order.total)}
                status={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <StatusChip entry={ORDER_FULFILMENT_LABELS[order.fulfilmentStatus]} />
                    <StatusChip entry={ORDER_PAYMENT_LABELS[order.paymentStatus]} />
                  </span>
                }
              />
            ))}
          </AccountPanel>
        </div>

        <aside className="mt-9 space-y-5 lg:mt-0">
          <section className="medi-panel p-5">
            <h2 className="medi-h3 text-medi-ink">Your details</h2>
            <dl className="mt-3.5 space-y-3">
              <Detail term="Name" value={customer.name} />
              <Detail term="Email" value={customer.email} />
              <Detail term="Telephone" value={customer.phone} />
              {organisation ? <Detail term="Institution" value={organisation.name} /> : null}
              {customer.jobTitle ? <Detail term="Role" value={customer.jobTitle} /> : null}
            </dl>
            <p className="medi-meta mt-4 text-medi-muted">
              These come from your Nickimart account and are what we print on your
              documents.{" "}
              <MedicalLink
                href="/account"
                className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
              >
                Change them
              </MedicalLink>
              .
            </p>
          </section>

          <MedicalLink
            href="/medicals/account/saved"
            className="medi-panel medi-focus flex items-center gap-3 p-5 transition-colors hover:bg-medi-mint-50"
          >
            <Heart className="h-5 w-5 shrink-0 text-medi-teal-600" aria-hidden />
            <span>
              <span className="block text-sm font-semibold text-medi-ink">Saved products</span>
              <span className="medi-meta text-medi-muted">
                {savedCount === 0
                  ? "Nothing saved yet"
                  : `${savedCount} ${savedCount === 1 ? "product" : "products"}`}
              </span>
            </span>
          </MedicalLink>

          <form action={logoutAction}>
            <button
              type="submit"
              className="medi-focus medi-press flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-semibold text-medi-body shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] hover:text-medi-danger"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="medi-meta text-medi-muted">{term}</dt>
      <dd className="mt-0.5 text-sm text-medi-ink">{value || "—"}</dd>
    </div>
  );
}
