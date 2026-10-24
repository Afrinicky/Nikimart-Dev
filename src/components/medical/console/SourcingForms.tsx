"use client";

import { Info } from "lucide-react";
import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, NumberInput, Select, TextArea, TextInput } from "@/components/medical/console/Field";
import {
  createSourcingFromOrder,
  recordSupplierQuoteReply,
  requestSupplierQuote,
} from "@/lib/medical/sales/sourcing-actions";
import { createPurchaseOrder } from "@/lib/medical/procurement/actions";
import { formatPesewas } from "@/lib/medical/money";

/**
 * Raising a sourcing request for what a sales order is short of.
 *
 * The shortfall is computed on the server and shown here before anything is
 * created, because the figure procurement acts on has to be the figure the
 * system holds, not an estimate typed into a form. Nothing is procured by
 * this: it records what must be procured, so several customers short of the
 * same reagent become one supplier order rather than four.
 */
export function OpenSourcingForm({
  salesOrderId,
  shortfall,
}: {
  salesOrderId: string;
  shortfall: { description: string; ordered: number; available: number; short: number; unit: string }[];
}) {
  return (
    <ActionForm
      action={createSourcingFromOrder}
      submitLabel="Raise sourcing request"
      pendingLabel="Creating…"
      variant="secondary"
      successMessage="Sourcing request raised."
      className="medi-panel medi-panel-lg p-5 sm:p-6"
    >
      <input type="hidden" name="salesOrderId" value={salesOrderId} />

      <ul className="divide-y divide-medi-rule">
        {shortfall.map((line) => (
          <li
            key={line.description}
            className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 first:pt-0"
          >
            <span className="text-[0.8125rem] font-semibold text-medi-ink">{line.description}</span>
            <span className="medi-meta font-figures text-medi-muted">
              {line.ordered} required · {line.available} available ·{" "}
              <span className="font-semibold text-medi-warning">
                {line.short} {line.unit} short
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" defaultValue="NORMAL">
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </Select>
        </Field>
        <Field label="Note for procurement" htmlFor="notes">
          <TextInput id="notes" placeholder="Customer will accept an equivalent brand." />
        </Field>
      </div>

      <p className="medi-meta mt-4 flex items-start gap-2 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
        <Info className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          This procures nothing. It records what has to be procured, so supplier prices can be
          gathered and compared before any money is committed.
        </span>
      </p>
    </ActionForm>
  );
}

/** Invite a supplier to quote against a sourcing request. */
export function RequestQuoteForm({
  sourcingRequestId,
  suppliers,
}: {
  sourcingRequestId: string;
  suppliers: { id: string; name: string; kind: string; currency: string }[];
}) {
  if (suppliers.length === 0) {
    return (
      <div className="medi-panel px-5 py-8 text-center">
        <p className="text-[0.8125rem] font-semibold text-medi-ink">
          Every active supplier has been invited.
        </p>
        <p className="medi-meta mt-1 text-medi-muted">
          Record their quotations below, then compare on landed cost.
        </p>
      </div>
    );
  }

  return (
    <ActionForm
      action={requestSupplierQuote}
      submitLabel="Invite to quote"
      pendingLabel="Sending…"
      variant="secondary"
      successMessage="Invitation recorded. Enter the quotation when it is returned."
      className="medi-panel p-5"
    >
      <input type="hidden" name="sourcingRequestId" value={sourcingRequestId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier" htmlFor="supplierId" required>
          <Select id="supplierId" required defaultValue="">
            <option value="" disabled>
              Choose a supplier
            </option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name} · {supplier.currency}
                {supplier.kind === "INTERNATIONAL" ? " · import" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" htmlFor="notes" hint="Anything requested beyond the line items.">
          <TextInput id="notes" placeholder="Quote freight to Accra and lead time." />
        </Field>
      </div>
    </ActionForm>
  );
}

/**
 * Recording a supplier's quotation.
 *
 * The exchange rate is captured here, at the moment the quotation is recorded,
 * rather than looked up when the comparison runs. Costing a March quotation at
 * today's rate is how a margin disappears between the decision and the
 * payment.
 */
export function QuoteReplyForm({
  quote,
}: {
  quote: {
    id: string;
    reference: string;
    currency: string;
    exchangeRate: string;
    isImport: boolean;
    freight: string;
    insurance: string;
    otherCharges: string;
    dutyPercent: string;
    clearingGhs: string;
    otherGhs: string;
    items: { id: string; description: string; quantity: number; unitCost: number; leadTimeDays: number }[];
  };
}) {
  return (
    <ActionForm
      action={recordSupplierQuoteReply}
      submitLabel="Record quotation"
      pendingLabel="Recording…"
      variant="secondary"
      successMessage="Recorded. The comparison above now includes it."
      className="medi-panel p-5"
    >
      <input type="hidden" name="quoteId" value={quote.id} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Quoted currency" htmlFor={`currency-${quote.id}`}>
          <TextInput
            id={`currency-${quote.id}`}
            name="currency"
            defaultValue={quote.currency}
            maxLength={3}
          />
        </Field>
        <Field
          label="Exchange rate to GH₵"
          htmlFor={`rate-${quote.id}`}
          hint="GH₵ per unit of the quoted currency."
        >
          <NumberInput
            id={`rate-${quote.id}`}
            name="exchangeRate"
            step="0.0001"
            min="0"
            defaultValue={quote.exchangeRate}
          />
        </Field>
        <Field label="Valid until" htmlFor={`valid-${quote.id}`}>
          <TextInput id={`valid-${quote.id}`} name="validUntil" type="date" />
        </Field>
      </div>

      <div className="relative mt-5 -mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-medi-mint-50">
              <th className="rounded-l-xl px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Line item
              </th>
              <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Quantity
              </th>
              <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Unit cost
              </th>
              <th className="rounded-r-xl px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Lead time (days)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-medi-rule">
            {quote.items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-3 align-top text-[0.8125rem] font-semibold text-medi-ink">
                  {item.description}
                </td>
                <td className="font-figures px-3 py-3 text-right align-top text-[0.8125rem] text-medi-body">
                  {item.quantity}
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <label className="sr-only" htmlFor={`cost-${item.id}`}>
                    Unit cost for {item.description}
                  </label>
                  <input
                    id={`cost-${item.id}`}
                    name={`cost:${item.id}`}
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={item.unitCost > 0 ? (item.unitCost / 100).toFixed(2) : ""}
                    className="medi-focus font-figures h-9 w-28 rounded-lg bg-white px-2 text-right text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <label className="sr-only" htmlFor={`lead-${item.id}`}>
                    Lead time in days for {item.description}
                  </label>
                  <input
                    id={`lead-${item.id}`}
                    name={`lead:${item.id}`}
                    type="number"
                    min={0}
                    defaultValue={item.leadTimeDays || ""}
                    className="medi-focus font-figures h-9 w-20 rounded-lg bg-white px-2 text-right text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <fieldset className="mt-6 min-w-0">
        <legend className="medi-label mb-1 text-medi-ink">Landed cost components</legend>
        <p className="medi-meta mb-3 text-medi-muted">
          {quote.isImport
            ? "An import quoted without these is not a landed cost. A lower unit price lands higher often enough that the comparison marks the quotation unconfirmed until they are entered."
            : "Usually nil for a local supplier. Enter whatever is charged on top of the goods."}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={`Freight (${quote.currency})`}
            htmlFor={`freight-${quote.id}`}
            hint="As quoted, in the supplier\u2019s currency."
          >
            <NumberInput
              id={`freight-${quote.id}`}
              name="freight"
              step="0.01"
              min="0"
              defaultValue={quote.freight}
            />
          </Field>
          <Field label={`Insurance (${quote.currency})`} htmlFor={`insurance-${quote.id}`}>
            <NumberInput
              id={`insurance-${quote.id}`}
              name="insurance"
              step="0.01"
              min="0"
              defaultValue={quote.insurance}
            />
          </Field>
          <Field
            label={`Other supplier charges (${quote.currency})`}
            htmlFor={`othercharges-${quote.id}`}
          >
            <NumberInput
              id={`othercharges-${quote.id}`}
              name="otherCharges"
              step="0.01"
              min="0"
              defaultValue={quote.otherCharges}
            />
          </Field>
          <Field
            label="Import duty (%)"
            htmlFor={`duty-${quote.id}`}
            hint="Charged on goods plus freight and insurance (CIF)."
          >
            <NumberInput
              id={`duty-${quote.id}`}
              name="dutyPercent"
              step="0.01"
              min="0"
              max="100"
              defaultValue={quote.dutyPercent}
            />
          </Field>
          <Field
            label="Clearing (GH₵)"
            htmlFor={`clearing-${quote.id}`}
            hint="Paid locally, in cedis."
          >
            <NumberInput
              id={`clearing-${quote.id}`}
              name="clearingGhs"
              step="0.01"
              min="0"
              defaultValue={quote.clearingGhs}
            />
          </Field>
          <Field label="Other local charges (GH₵)" htmlFor={`otherghs-${quote.id}`}>
            <NumberInput
              id={`otherghs-${quote.id}`}
              name="otherGhs"
              step="0.01"
              min="0"
              defaultValue={quote.otherGhs}
            />
          </Field>
        </div>
      </fieldset>

      <Field
        className="mt-5"
        label="Note"
        htmlFor={`qnotes-${quote.id}`}
        hint="Minimum order quantity, part shipment, any conditions attached."
      >
        <TextArea id={`qnotes-${quote.id}`} name="notes" rows={2} />
      </Field>
    </ActionForm>
  );
}

/**
 * Raising the supplier purchase order a sourcing request has settled on.
 *
 * The selection is a quotation, not a supplier. Selecting the quotation names
 * the supplier, carries its prices and its exchange rate onto the order, and
 * records which quotation the order was priced from — without that last part a
 * landed-cost comparison is a screen nobody can audit afterwards.
 *
 * The order is raised as a draft. Approval is the deliberate second step and
 * it belongs to a role accountable for the spending.
 */
export function RaisePurchaseOrderForm({
  sourcingRequestId,
  offers,
}: {
  sourcingRequestId: string;
  /** Ranked cheapest-landed first, so the default is the recommendation. */
  offers: {
    quoteId: string;
    reference: string;
    supplierName: string;
    currency: string;
    totalGhs: number;
    leadTimeDays: number;
    priced: boolean;
  }[];
}) {
  const priced = offers.filter((offer) => offer.priced);

  if (priced.length === 0) {
    return (
      <div className="medi-panel px-5 py-8 text-center">
        <p className="text-[0.8125rem] font-semibold text-medi-ink">No priced quotations yet</p>
        <p className="medi-prose mx-auto mt-1 text-[0.8125rem] text-medi-body">
          Record a supplier quotation and the comparison will rank the offers on landed cost.
          Raising an order before then commits money to a price nobody has verified.
        </p>
      </div>
    );
  }

  const best = priced[0];

  return (
    <ActionForm
      action={createPurchaseOrder}
      submitLabel="Create draft purchase order"
      pendingLabel="Creating…"
      successMessage="Draft created. Nothing is committed until it is approved."
      className="medi-panel medi-panel-lg p-5"
    >
      <input type="hidden" name="sourcingRequestId" value={sourcingRequestId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Supplier quotation"
          htmlFor="po-quote"
          required
          hint={`Lowest landed cost: ${best.supplierName} at ${formatPesewas(best.totalGhs)}.`}
        >
          <Select id="po-quote" name="supplierQuoteId" required defaultValue={best.quoteId}>
            {priced.map((offer) => (
              <option key={offer.quoteId} value={offer.quoteId}>
                {offer.supplierName} · {formatPesewas(offer.totalGhs)} landed
                {offer.leadTimeDays > 0 ? ` · ${offer.leadTimeDays} days` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Expected delivery"
          htmlFor="po-expected"
          hint="Leave blank to use the supplier\u2019s lead time."
        >
          <TextInput id="po-expected" name="expectedAt" type="date" />
        </Field>
        <Field label="Note" htmlFor="po-notes">
          <TextInput id="po-notes" name="notes" />
        </Field>
      </div>

      <p className="medi-meta mt-4 flex items-start gap-2 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
        <Info className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          The order is raised at the quoted prices and the exchange rate recorded with the
          quotation, and it carries that quotation&rsquo;s reference. Selecting anything other than
          the lowest landed cost is a decision worth a note.
        </span>
      </p>
    </ActionForm>
  );
}
