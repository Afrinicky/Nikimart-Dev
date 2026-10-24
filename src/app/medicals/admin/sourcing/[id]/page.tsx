import { notFound } from "next/navigation";
import { Search, TrendingDown } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import {
  QuoteReplyForm,
  RaisePurchaseOrderForm,
  RequestQuoteForm,
} from "@/components/medical/console/SourcingForms";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { getSourcingRequest, suppliersNotYetAsked } from "@/lib/medical/sales/queries";
import { compareQuotesForSourcing } from "@/lib/medical/procurement/queries";
import {
  purchaseOrderStatus,
  sourcingStatus,
  supplierQuoteStatus,
} from "@/lib/medical/procurement/status";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { formatDate } from "@/lib/medical/format";
import { canSeeCost, canSeeSection } from "@/lib/medical/roles";

type Params = Promise<{ id: string }>;

/**
 * A single sourcing request: what has to be procured, which suppliers were
 * invited, and what each offer would land at.
 *
 * The comparison is on **landed cost**, not unit price, and the cheapest on
 * each measure is frequently a different supplier. A dollar price reads as
 * cheaper than a cedi one until duty on the CIF value and clearing are added,
 * and the error is common enough that the screen states what choosing on unit
 * price would have cost.
 */
export default async function SourcingRequestPage({ params }: { params: Params }) {
  const staff = await requireMedicalStaff("/medicals/admin/sourcing");
  const { id } = await params;

  const request = await getSourcingRequest(id);
  if (!request) notFound();

  // Sales may open a round — they are the ones who know the customer will not
  // wait — but supplier pricing is not theirs to see, and the server refuses
  // the quotation actions for them either way. So the page shows them the
  // round and its progress and nothing about what anybody charges.
  const showCost = canSeeCost(staff.role);
  const canQuote = canSeeSection(staff.role, "supplier-quotes");
  const [comparison, suppliers] = await Promise.all([
    showCost ? compareQuotesForSourcing(id) : null,
    canQuote ? suppliersNotYetAsked(id) : Promise.resolve([]),
  ]);

  const ranked = comparison?.ranked ?? [];
  const byQuoteId = new Map(ranked.map((cost) => [cost.offerId, cost]));

  const offers = request.supplierQuotes
    .map((quote) => {
      const costed = byQuoteId.get(quote.id);
      return {
        quoteId: quote.id,
        reference: quote.reference,
        supplierName: quote.supplier.name,
        currency: quote.currency,
        totalGhs: costed?.totalGhs ?? 0,
        leadTimeDays: costed?.leadTimeDays ?? 0,
        priced: quote.status === "RECEIVED" && (costed?.totalGhs ?? 0) > 0,
      };
    })
    .sort((a, b) => Number(b.priced) - Number(a.priced) || a.totalGhs - b.totalGhs);

  const outstanding = request.items.reduce(
    (n, item) => n + Math.max(0, item.quantity - item.quantityOrdered),
    0,
  );
  const ordered = request.items.reduce((n, item) => n + item.quantityOrdered, 0);
  const received = request.items.reduce((n, item) => n + item.quantityReceived, 0);

  // Each purchase order this round produced, once, however many lines it covers.
  const orders = [
    ...new Map(
      request.items
        .flatMap((item) => item.purchaseOrderItems)
        .map((line) => [line.purchaseOrder.id, line.purchaseOrder]),
    ).values(),
  ];

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title={request.reference}
        subtitle={[
          REASONS[request.reason] ?? request.reason.toLowerCase(),
          request.salesOrder?.organisation?.name,
          `raised ${formatDate(request.createdAt)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        icon={Search}
        back={{ href: "/medicals/admin/sourcing", label: "Sourcing requests" }}
      >
        <sourcingStatus.Badge status={request.status as never} className="self-center" />
        {request.priority === "URGENT" || request.priority === "HIGH" ? (
          <StatusBadge
            label={request.priority.toLowerCase()}
            tone={request.priority === "URGENT" ? "bad" : "warn"}
            className="self-center"
          />
        ) : null}
      </ConsoleHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Line items" value={String(request.items.length)} />
        <StatCard
          label="Outstanding quantity"
          value={String(outstanding)}
          tone={outstanding > 0 ? "attention" : "default"}
          hint={`${ordered} on order · ${received} received`}
        />
        <StatCard label="Suppliers invited" value={String(request.supplierQuotes.length)} />
        {showCost ? (
          <StatCard
            label="Cheapest landed"
            value={comparison?.best ? formatPesewas(comparison.best.totalGhs) : "Not yet quoted"}
            hint={comparison?.best?.supplierName}
          />
        ) : null}
      </div>

      {request.salesOrder ? (
        <p className="medi-meta rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
          Raised for{" "}
          <MedicalLink
            href={`/medicals/admin/customer-orders/${request.salesOrder.id}`}
            className="medi-focus font-figures rounded font-semibold underline"
          >
            {request.salesOrder.reference}
          </MedicalLink>
          . Each line item below is tied to the sales order line it covers, so a short delivery
          can be traced to the customer it was intended for.
        </p>
      ) : null}

      {request.notes ? (
        <p className="medi-prose text-[0.875rem] text-medi-body">{request.notes}</p>
      ) : null}

      <section>
        <PanelHeading title="Items to procure" />
        <ConsoleTable
          minWidth={760}
          columns={[
            "Description",
            { label: "Quantity required", numeric: true },
            { label: "On order", numeric: true },
            { label: "Received", numeric: true },
            "Status",
            "Purchase orders",
          ]}
          empty={{
            title: "No line items",
            body: "This request records nothing to procure.",
          }}
        >
          {request.items.map((item) => (
            <Row key={item.id}>
              <td className={tdKey}>
                {item.description}
                {item.product ? (
                  <span className="medi-meta mt-0.5 block font-normal text-medi-muted">
                    <span className="font-figures">{item.product.sku}</span>
                  </span>
                ) : (
                  <span className="medi-meta mt-0.5 block font-normal text-medi-muted">
                    Not in the catalogue
                  </span>
                )}
              </td>
              <td className={tdNum}>
                {item.quantity} {item.unit}
              </td>
              <td className={tdNum}>{item.quantityOrdered}</td>
              <td className={tdNum}>{item.quantityReceived}</td>
              <td className={td}>
                <sourcingStatus.Badge status={item.status as never} />
              </td>
              <td className={td}>
                {item.purchaseOrderItems.length === 0 ? (
                  <span className="medi-meta text-medi-muted">None</span>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {item.purchaseOrderItems.map((line) => (
                      <MedicalLink
                        key={line.id}
                        href={`/medicals/admin/purchase-orders/${line.purchaseOrder.id}`}
                        className="medi-focus font-figures medi-meta rounded font-semibold text-medi-teal-700 hover:underline"
                      >
                        {line.purchaseOrder.reference}
                      </MedicalLink>
                    ))}
                  </span>
                )}
              </td>
            </Row>
          ))}
        </ConsoleTable>
      </section>

      {showCost && ranked.length > 0 ? (
        <section>
          <PanelHeading
            title="Landed cost comparison"
            subtitle="Goods, freight, duty on the CIF value and clearing — the full cost of acquisition in GH₵."
          />

          {comparison?.cheapestByUnitPrice &&
          comparison.best &&
          comparison.cheapestByUnitPrice.offerId !== comparison.best.offerId ? (
            <p className="medi-meta mt-3 flex items-start gap-2 rounded-xl bg-medi-info-soft px-3.5 py-3 text-medi-info">
              <TrendingDown className="mt-px h-4 w-4 shrink-0" aria-hidden />
              <span>
                {comparison.cheapestByUnitPrice.supplierName} quotes the lowest unit price but
                lands at {formatPesewas(comparison.cheapestByUnitPrice.totalGhs)} against{" "}
                {formatPesewas(comparison.best.totalGhs)} from {comparison.best.supplierName}.
                Awarding on landed cost saves{" "}
                <span className="font-figures font-semibold">
                  {formatPesewas(comparison.savingAgainstUnitPriceChoice)}
                </span>
                .
              </span>
            </p>
          ) : null}

          <ConsoleTable
            minWidth={900}
            columns={[
              "Supplier",
              { label: "Goods", numeric: true },
              { label: "Freight", numeric: true },
              { label: "Duty", numeric: true },
              { label: "Clearing", numeric: true },
              { label: "Landed cost", numeric: true },
              { label: "Cost per unit", numeric: true },
              { label: "Lead time", numeric: true },
            ]}
            empty={{ title: "No quotations", body: "No supplier has quoted yet." }}
          >
            {ranked.map((cost, index) => (
              <Row key={cost.offerId}>
                <td className={tdKey}>
                  {cost.supplierName}
                  {index === 0 ? (
                    <StatusBadge label="Lowest landed cost" tone="good" className="ml-2" />
                  ) : null}
                  {!cost.costsConfirmed ? (
                    <span className="medi-meta mt-0.5 block font-normal text-medi-warning">
                      Charges not confirmed
                    </span>
                  ) : null}
                </td>
                <td className={tdNum}>{formatPesewas(cost.goodsGhs)}</td>
                <td className={tdNum}>{formatPesewas(cost.freightGhs)}</td>
                <td className={tdNum}>{formatPesewas(cost.dutyGhs)}</td>
                <td className={tdNum}>{formatPesewas(cost.clearingGhs)}</td>
                <td className={tdNum}>
                  <span className="font-semibold">{formatPesewas(cost.totalGhs)}</span>
                </td>
                <td className={tdNum}>{formatPesewas(cost.perUnitGhs)}</td>
                <td className={tdNum}>
                  {cost.leadTimeDays > 0 ? `${cost.leadTimeDays} days` : "—"}
                </td>
              </Row>
            ))}
          </ConsoleTable>

          {comparison?.hasEstimates ? (
            <p className="medi-meta mt-3 text-medi-muted">
              At least one quotation still carries estimated charges. The ranking will change once
              the actual figures are entered.
            </p>
          ) : null}
        </section>
      ) : null}

      {orders.length > 0 ? (
        <section>
          <PanelHeading title="Purchase orders raised" />
          <ul className="medi-panel mt-3 divide-y divide-medi-rule">
            {orders.map((order) => (
              <li key={order.id} className="flex items-center gap-3 px-5 py-3">
                <MedicalLink
                  href={`/medicals/admin/purchase-orders/${order.id}`}
                  className="medi-focus font-figures rounded text-[0.8125rem] font-semibold text-medi-ink hover:text-medi-teal-700"
                >
                  {order.reference}
                </MedicalLink>
                <purchaseOrderStatus.Badge status={order.status as never} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!showCost ? (
        <p className="medi-meta rounded-xl bg-medi-surface px-3.5 py-3 text-medi-muted">
          Supplier prices and the landed-cost comparison are not available to your role. The line
          items above and the purchase orders raised against them are the state of this request.
        </p>
      ) : null}

      {canQuote && request.status !== "CANCELLED" ? (
        <>
          <section>
            <PanelHeading
              title="Invite a supplier to quote"
              subtitle="One request, several quotations. Comparing quotations gathered for different requests compares nothing."
            />
            <div className="mt-4">
              <RequestQuoteForm sourcingRequestId={request.id} suppliers={suppliers} />
            </div>
          </section>

          {request.supplierQuotes.length > 0 ? (
            <section>
              <PanelHeading
                title="Supplier quotations"
                subtitle="Enter prices in the supplier's own currency, at the exchange rate that applied when they quoted."
              />
              <div className="mt-4 space-y-4">
                {request.supplierQuotes.map((quote) => (
                  <div key={quote.id}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-[0.875rem] font-semibold text-medi-ink">
                        {quote.supplier.name}
                      </span>
                      <span className="medi-meta font-figures text-medi-muted">
                        {quote.reference}
                      </span>
                      <supplierQuoteStatus.Badge status={quote.status as never} />
                      {quote.validUntil ? (
                        <span className="medi-meta text-medi-muted">
                          valid until {formatDate(quote.validUntil)}
                        </span>
                      ) : null}
                    </div>
                    <QuoteReplyForm
                      quote={{
                        id: quote.id,
                        reference: quote.reference,
                        currency: quote.currency,
                        exchangeRate: String(quote.exchangeRate),
                        isImport: quote.supplier.kind === "INTERNATIONAL",
                        freight: money(quote.freight),
                        insurance: money(quote.insurance),
                        otherCharges: money(quote.otherCharges),
                        // Basis points on the way in, a percentage on the way
                        // out: a tariff is published as a percentage and that
                        // is what the person entering it is reading from.
                        dutyPercent: quote.dutyRateBp > 0 ? String(quote.dutyRateBp / 100) : "",
                        clearingGhs: money(quote.clearingGhs),
                        otherGhs: money(quote.otherGhs),
                        items: quote.items.map((item) => ({
                          id: item.id,
                          description: item.description,
                          quantity: item.quantity,
                          unitCost: toPesewas(item.unitCost),
                          leadTimeDays: item.leadTimeDays,
                        })),
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {outstanding > 0 ? (
            <section>
              <PanelHeading
                title="Raise a purchase order"
                subtitle="Line items are carried from this request. The order remains a draft until approved by a role accountable for the spending."
              />
              <div className="mt-4">
                <RaisePurchaseOrderForm sourcingRequestId={request.id} offers={offers} />
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Blank for nothing, so an unstated charge does not read as a stated zero. */
function money(value: unknown): string {
  const pesewas = toPesewas(value as Parameters<typeof toPesewas>[0]);
  return pesewas > 0 ? (pesewas / 100).toFixed(2) : "";
}

const REASONS: Record<string, string> = {
  CUSTOMER_ORDER: "for a sales order",
  STOCK_REPLENISHMENT: "stock replenishment",
  TENDER: "for a tender",
  SAMPLE: "for a sample",
  QUOTATION: "to price a quotation",
};
