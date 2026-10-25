"use client";

import { FileText, Lock } from "lucide-react";
import { ActionForm } from "@/components/medical/console/ActionForm";
import {
  Field,
  FieldSet,
  NumberInput,
  Select,
  TextArea,
  TextInput,
} from "@/components/medical/console/Field";
import {
  addQuotationLine,
  answerQuotation,
  assignRequest,
  cancelQuotation,
  convertQuotation,
  draftQuotationFromRequest,
  issueQuotation,
  reviseQuotation,
  saveQuotation,
  sendQuotation,
  setRequestStatus,
} from "@/lib/medical/quotations/actions";
import { formatPesewas } from "@/lib/medical/money";

/** Take a request off the queue. */
export function TakeRequestForm({ requestId, taken }: { requestId: string; taken: boolean }) {
  return (
    <ActionForm
      action={assignRequest}
      submitLabel={taken ? "Reassign to me" : "Take this request"}
      pendingLabel="Assigning…"
      variant="secondary"
      successMessage="Assigned."
      className="min-w-0"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <p className="medi-meta text-medi-body">
        {taken
          ? "It is already with a colleague. Taking it moves it to you."
          : "Taking a new request also moves it to under review — the first look is the review."}
      </p>
    </ActionForm>
  );
}

/** Move a request along the queue. */
export function RequestStatusForm({ requestId, status }: { requestId: string; status: string }) {
  return (
    <ActionForm
      action={setRequestStatus}
      submitLabel="Change status"
      pendingLabel="Changing…"
      variant="secondary"
      successMessage="Changed."
      className="medi-panel p-5"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" htmlFor="status">
          <Select id="status" defaultValue={status}>
            <option value="NEW">New</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="AWAITING_SUPPLIER">Awaiting supplier</option>
            <option value="DRAFTING">Being priced</option>
            <option value="REVISION_REQUESTED">Revision asked for</option>
            <option value="DECLINED">Declined</option>
            <option value="EXPIRED">Lapsed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </Field>
        <Field
          label="Why"
          htmlFor="why"
          hint="Required when closing it. Goes on the timeline either way."
        >
          <TextInput id="why" name="why" />
        </Field>
      </div>
    </ActionForm>
  );
}

/** Start a quotation, or a proforma, from a request. */
export function DraftQuotationForm({ requestId }: { requestId: string }) {
  return (
    <ActionForm
      action={draftQuotationFromRequest}
      submitLabel="Draft a document"
      pendingLabel="Drafting…"
      successMessage="Drafted."
      className="medi-panel medi-panel-lg p-5"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <Field
        label="What kind"
        htmlFor="documentType"
        hint="A proforma states agreed terms for a finance office to release funds. It is not a receipt and not a tax invoice, and the document says so on its face."
      >
        <Select id="documentType" defaultValue="QUOTATION">
          <option value="QUOTATION">Quotation</option>
          <option value="PROFORMA">Proforma invoice</option>
        </Select>
      </Field>
      <p className="medi-meta mt-4 flex items-start gap-2 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
        <FileText className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          Lines are copied from what the customer asked for, at catalogue prices as a starting
          point. Anything they asked for outside the catalogue comes across as a line to price by
          hand rather than a note somebody will miss.
        </span>
      </p>
    </ActionForm>
  );
}

/**
 * The draft editor.
 *
 * Rendered only for a draft, and the server refuses it for anything else: once
 * a version is issued the customer has a copy, and a document that changes
 * after it has been sent is not a document.
 *
 * A quantity of zero removes a line, which is safe here because nothing outside
 * the draft references it yet.
 */
export function QuotationEditor({
  quotation,
  lines,
}: {
  quotation: {
    id: string;
    discountKind: string;
    discountValue: string;
    deliveryCharge: string;
    handlingCharge: string;
    otherCharge: string;
    otherChargeLabel: string;
    validUntil: string;
    paymentTerms: string;
    deliveryEstimate: string;
    notes: string;
    termsAndConditions: string;
    billToName: string;
    billToContact: string;
    billToEmail: string;
    billToPhone: string;
    billToAddress: string;
    billToTaxId: string;
    deliverToAddress: string;
  };
  lines: {
    id: string;
    description: string;
    detail: string;
    catalogueNumber: string;
    quantity: number;
    unit: string;
    unitPrice: string;
    discountKind: string;
    discountValue: string;
  }[];
}) {
  return (
    <ActionForm
      action={saveQuotation}
      submitLabel="Save and recompute"
      pendingLabel="Saving…"
      successMessage="Saved."
      className="medi-panel medi-panel-lg space-y-8 p-5 sm:p-6"
    >
      <input type="hidden" name="quotationId" value={quotation.id} />

      <div>
        <h3 className="medi-h3 mb-1 text-[1rem]">Lines</h3>
        <p className="medi-meta mb-3 text-medi-muted">
          A quantity of zero removes the line. Totals are computed on the server from these figures,
          never taken from the page.
        </p>
        {/* `relative` keeps the visually hidden labels inside the scroller —
            see the note in ConsoleTable. */}
        <div className="relative -mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-medi-mint-50">
                <th className="rounded-l-xl px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                  Description
                </th>
                <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                  Quantity
                </th>
                <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                  Unit price
                </th>
                <th className="px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                  Discount
                </th>
                <th className="rounded-r-xl px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-medi-rule">
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-3 py-3 align-top">
                    <label className="sr-only" htmlFor={`desc-${line.id}`}>
                      Description of this line
                    </label>
                    <input
                      id={`desc-${line.id}`}
                      name={`desc:${line.id}`}
                      defaultValue={line.description}
                      className="medi-focus h-9 w-64 rounded-lg bg-white px-2 text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)]"
                    />
                    <label className="sr-only" htmlFor={`detail-${line.id}`}>
                      Second line under {line.description}
                    </label>
                    <input
                      id={`detail-${line.id}`}
                      name={`detail:${line.id}`}
                      defaultValue={line.detail}
                      placeholder="Specification or condition"
                      className="medi-focus mt-1.5 h-8 w-64 rounded-lg bg-white px-2 text-[0.75rem] text-medi-body shadow-[inset_0_0_0_1px_var(--color-medi-rule)] placeholder:text-medi-muted"
                    />
                    {line.catalogueNumber ? (
                      <span className="medi-meta font-figures mt-1 block text-medi-muted">
                        {line.catalogueNumber}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right align-top">
                    <label className="sr-only" htmlFor={`qty-${line.id}`}>
                      Quantity of {line.description}
                    </label>
                    <input
                      id={`qty-${line.id}`}
                      name={`qty:${line.id}`}
                      type="number"
                      min={0}
                      defaultValue={line.quantity}
                      className="medi-focus font-figures h-9 w-20 rounded-lg bg-white px-2 text-right text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="medi-meta mt-1 block text-medi-muted">{line.unit}</span>
                  </td>
                  <td className="px-3 py-3 text-right align-top">
                    <label className="sr-only" htmlFor={`price-${line.id}`}>
                      Unit price of {line.description}
                    </label>
                    <input
                      id={`price-${line.id}`}
                      name={`price:${line.id}`}
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={line.unitPrice}
                      className="medi-focus font-figures h-9 w-28 rounded-lg bg-white px-2 text-right text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <label className="sr-only" htmlFor={`dkind-${line.id}`}>
                      Discount kind for {line.description}
                    </label>
                    <select
                      id={`dkind-${line.id}`}
                      name={`dkind:${line.id}`}
                      defaultValue={line.discountKind}
                      className="medi-focus h-9 w-28 rounded-lg bg-white px-2 text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)]"
                    >
                      <option value="NONE">None</option>
                      <option value="PERCENT">Percent</option>
                      <option value="AMOUNT">Amount</option>
                    </select>
                  </td>
                  <td className="px-3 py-3 text-right align-top">
                    <label className="sr-only" htmlFor={`dvalue-${line.id}`}>
                      Discount value for {line.description}
                    </label>
                    <input
                      id={`dvalue-${line.id}`}
                      name={`dvalue:${line.id}`}
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={line.discountValue}
                      className="medi-focus font-figures h-9 w-24 rounded-lg bg-white px-2 text-right text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FieldSet
        legend="Document discount and charges"
        description="The discount applies to the subtotal, after any line discounts. Charges are added and never discounted."
        columns={3}
      >
        <Field label="Discount" htmlFor="discountKind">
          <Select id="discountKind" defaultValue={quotation.discountKind}>
            <option value="NONE">None</option>
            <option value="PERCENT">Percent of the subtotal</option>
            <option value="AMOUNT">A fixed amount</option>
          </Select>
        </Field>
        <Field label="Discount value" htmlFor="discountValue" hint="Percent, or GH₵.">
          <NumberInput
            id="discountValue"
            step="0.01"
            min="0"
            defaultValue={quotation.discountValue}
          />
        </Field>
        <Field label="Valid until" htmlFor="validUntil">
          <TextInput id="validUntil" type="date" defaultValue={quotation.validUntil} />
        </Field>
        <Field label="Delivery charge (GH₵)" htmlFor="deliveryCharge">
          <NumberInput
            id="deliveryCharge"
            step="0.01"
            min="0"
            defaultValue={quotation.deliveryCharge}
          />
        </Field>
        <Field label="Handling charge (GH₵)" htmlFor="handlingCharge">
          <NumberInput
            id="handlingCharge"
            step="0.01"
            min="0"
            defaultValue={quotation.handlingCharge}
          />
        </Field>
        <Field label="Other charge (GH₵)" htmlFor="otherCharge">
          <NumberInput id="otherCharge" step="0.01" min="0" defaultValue={quotation.otherCharge} />
        </Field>
        <Field
          label="What the other charge is for"
          htmlFor="otherChargeLabel"
          className="sm:col-span-2 lg:col-span-3"
        >
          <TextInput id="otherChargeLabel" defaultValue={quotation.otherChargeLabel} />
        </Field>
      </FieldSet>

      <FieldSet
        legend="Addressed to"
        description="Copied onto the document, not joined to it. An institution that renames itself next year must not rename itself on a document issued this year."
        columns={2}
      >
        <Field label="Name" htmlFor="billToName" required>
          <TextInput id="billToName" required defaultValue={quotation.billToName} />
        </Field>
        <Field label="Contact" htmlFor="billToContact">
          <TextInput id="billToContact" defaultValue={quotation.billToContact} />
        </Field>
        <Field label="Email" htmlFor="billToEmail">
          <TextInput id="billToEmail" type="email" defaultValue={quotation.billToEmail} />
        </Field>
        <Field label="Telephone" htmlFor="billToPhone">
          <TextInput id="billToPhone" defaultValue={quotation.billToPhone} />
        </Field>
        <Field label="Address" htmlFor="billToAddress" className="sm:col-span-2">
          <TextArea id="billToAddress" rows={2} defaultValue={quotation.billToAddress} />
        </Field>
        <Field label="Tax identification" htmlFor="billToTaxId">
          <TextInput id="billToTaxId" defaultValue={quotation.billToTaxId} />
        </Field>
        <Field label="Deliver to" htmlFor="deliverToAddress">
          <TextInput id="deliverToAddress" defaultValue={quotation.deliverToAddress} />
        </Field>
      </FieldSet>

      <FieldSet legend="Terms" columns={2}>
        <Field label="Payment terms" htmlFor="paymentTerms" className="sm:col-span-2">
          <TextInput id="paymentTerms" defaultValue={quotation.paymentTerms} />
        </Field>
        <Field label="Delivery estimate" htmlFor="deliveryEstimate">
          <TextInput id="deliveryEstimate" defaultValue={quotation.deliveryEstimate} />
        </Field>
        <Field label="Note above the signature" htmlFor="notes" className="sm:col-span-2">
          <TextArea id="notes" rows={2} defaultValue={quotation.notes} />
        </Field>
        <Field
          label="Terms and conditions"
          htmlFor="termsAndConditions"
          hint="The long text at the foot of the document."
          className="sm:col-span-2"
        >
          <TextArea id="termsAndConditions" rows={4} defaultValue={quotation.termsAndConditions} />
        </Field>
      </FieldSet>
    </ActionForm>
  );
}

/** Add a line to a draft — a catalogue product, or something typed by hand. */
export function AddLineForm({
  quotationId,
  products,
}: {
  quotationId: string;
  products: { id: string; label: string }[];
}) {
  return (
    <ActionForm
      action={addQuotationLine}
      submitLabel="Add line"
      pendingLabel="Adding…"
      variant="secondary"
      successMessage="Added."
      className="medi-panel p-5"
    >
      <input type="hidden" name="quotationId" value={quotationId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Catalogue product"
          htmlFor="productId"
          hint="Or leave it and describe the line."
          className="sm:col-span-2"
        >
          <Select id="productId" defaultValue="">
            <option value="">Not from the catalogue</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity" htmlFor="quantity">
          <NumberInput id="quantity" min="1" defaultValue="1" />
        </Field>
        <Field label="Unit price (GH₵)" htmlFor="unitPrice" hint="Blank uses the catalogue price.">
          <NumberInput id="unitPrice" step="0.01" min="0" />
        </Field>
        <Field
          label="Description"
          htmlFor="description"
          hint="Required for a line not in the catalogue — installation, training, a part sourced to order."
          className="sm:col-span-2 lg:col-span-3"
        >
          <TextInput id="description" />
        </Field>
        <Field label="Unit" htmlFor="unit">
          <TextInput id="unit" placeholder="unit" />
        </Field>
      </div>
    </ActionForm>
  );
}

/** Issue it, and freeze it. */
export function IssueForm({
  quotationId,
  totalPayable,
  unpriced,
}: {
  quotationId: string;
  totalPayable: number;
  unpriced: number;
}) {
  return (
    <ActionForm
      action={issueQuotation}
      submitLabel="Issue it"
      pendingLabel="Issuing…"
      successMessage="Issued."
      className="medi-panel p-5"
    >
      <input type="hidden" name="quotationId" value={quotationId} />
      <p className="medi-meta flex items-start gap-2 rounded-xl bg-medi-warning-soft px-3.5 py-3 text-medi-warning">
        <Lock className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          Issuing freezes the document at{" "}
          <span className="font-figures font-semibold">{formatPesewas(totalPayable)}</span>. From
          then on the lines and prices are read-only — a price that has to change becomes a new
          version that supersedes this one.
          {unpriced > 0
            ? ` ${unpriced} line${unpriced === 1 ? " has" : "s have"} no price yet, and it will be refused until ${unpriced === 1 ? "it is" : "they are"} priced.`
            : ""}
        </span>
      </p>
    </ActionForm>
  );
}

/** Record that it has gone out. */
export function SendForm({ quotationId }: { quotationId: string }) {
  return (
    <ActionForm
      action={sendQuotation}
      submitLabel="Record as sent"
      pendingLabel="Recording…"
      variant="secondary"
      successMessage="Recorded."
      className="medi-panel p-5"
    >
      <input type="hidden" name="quotationId" value={quotationId} />
      <Field label="How it went" htmlFor="how">
        <Select id="how" defaultValue="EMAIL">
          <option value="EMAIL">Email</option>
          <option value="HAND">By hand</option>
          <option value="PORTAL">Their portal</option>
          <option value="POST">Post</option>
        </Select>
      </Field>
    </ActionForm>
  );
}

/** The customer's answer, either way. */
export function AnswerForm({ quotationId, accept }: { quotationId: string; accept: boolean }) {
  return (
    <ActionForm
      action={answerQuotation}
      submitLabel={accept ? "Record their acceptance" : "Record their decline"}
      pendingLabel="Recording…"
      variant={accept ? "primary" : "danger"}
      successMessage="Recorded."
      className="medi-panel p-5"
    >
      <input type="hidden" name="quotationId" value={quotationId} />
      <input type="hidden" name="accept" value={accept ? "1" : "0"} />
      {accept ? (
        <p className="medi-meta text-medi-body">
          An accepted quotation is an agreement, not an order. Nothing is reserved and nothing is
          owed until it is converted.
        </p>
      ) : (
        <Field
          label="Why did they decline?"
          htmlFor={`decline-${quotationId}`}
          hint="The most useful field on this page. Price, lead time, a competitor — it is what the next quotation is priced against."
        >
          <TextArea id={`decline-${quotationId}`} name="reason" rows={2} required />
        </Field>
      )}
    </ActionForm>
  );
}

/** A new version, superseding this one. */
export function ReviseForm({ quotationId, version }: { quotationId: string; version: number }) {
  return (
    <ActionForm
      action={reviseQuotation}
      submitLabel="Draft a new version"
      pendingLabel="Drafting…"
      variant="secondary"
      successMessage="New version drafted."
      className="medi-panel p-5"
    >
      <input type="hidden" name="quotationId" value={quotationId} />
      <Field
        label="Why is it being revised?"
        htmlFor={`revise-${quotationId}`}
        hint={`Version ${version} is kept exactly as issued — the customer has a copy of it.`}
      >
        <TextArea id={`revise-${quotationId}`} name="reason" rows={2} required />
      </Field>
    </ActionForm>
  );
}

/** Turn an accepted quotation into an order. */
export function ConvertForm({
  quotationId,
  totalPayable,
}: {
  quotationId: string;
  totalPayable: number;
}) {
  return (
    <ActionForm
      action={convertQuotation}
      submitLabel="Raise the order"
      pendingLabel="Raising…"
      successMessage="Order raised."
      className="medi-panel medi-panel-lg p-5"
    >
      <input type="hidden" name="quotationId" value={quotationId} />
      <p className="medi-meta text-medi-body">
        Raises a sales order for {formatPesewas(totalPayable)} and reserves what stock can cover.
        Reserved, not deducted — the goods are still on the shelf and the delivery note is what says
        they have left. A shortfall becomes a sourcing request rather than a refusal.
      </p>
    </ActionForm>
  );
}

/** Cancel it. */
export function CancelQuotationForm({ quotationId }: { quotationId: string }) {
  return (
    <ActionForm
      action={cancelQuotation}
      submitLabel="Cancel this quotation"
      pendingLabel="Cancelling…"
      variant="danger"
      successMessage="Cancelled."
      className="medi-panel p-5"
    >
      <input type="hidden" name="quotationId" value={quotationId} />
      <Field label="Why" htmlFor={`cancel-${quotationId}`} hint="Goes on the timeline.">
        <TextArea id={`cancel-${quotationId}`} name="reason" rows={2} required />
      </Field>
    </ActionForm>
  );
}
