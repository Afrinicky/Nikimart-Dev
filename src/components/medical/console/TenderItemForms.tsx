"use client";

import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, NumberInput, Select, TextArea, TextInput } from "@/components/medical/console/Field";
import {
  addTenderItem,
  createTenderSubmission,
  priceSubmissionItem,
  saveTenderDocument,
  submitTender,
} from "@/lib/medical/tenders/actions";
import { toCedis } from "@/lib/medical/money";

/** A line as the institution published it — their words, their lot number. */
export function TenderItemForm({
  tenderId,
  products,
}: {
  tenderId: string;
  products: { id: string; name: string; sku: string }[];
}) {
  return (
    <ActionForm
      action={addTenderItem}
      submitLabel="Add requirement"
      successMessage="Requirement added."
      className="medi-panel medi-panel-lg p-5"
    >
      <input type="hidden" name="tenderId" value={tenderId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Lot number" htmlFor="lotNumber" hint="As published — “3(b)(ii)” and all.">
          <TextInput id="lotNumber" />
        </Field>
        <Field label="Description" htmlFor="description" required className="lg:col-span-2">
          <TextInput id="description" required placeholder="As they wrote it" />
        </Field>
        <Field label="Quantity" htmlFor="quantity" required>
          <NumberInput id="quantity" type="number" min={1} defaultValue={1} required />
        </Field>
        <Field label="Unit" htmlFor="unit">
          <TextInput id="unit" defaultValue="unit" />
        </Field>
        <Field label="Our catalogue match" htmlFor="productId" hint="Optional — many lines are sourced.">
          <Select id="productId" defaultValue="">
            <option value="">No match</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.sku})
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Acceptable brands"
          htmlFor="acceptableBrands"
          hint="Comma separated. Empty is not the same as “any”."
          className="lg:col-span-2"
        >
          <TextInput id="acceptableBrands" placeholder="Roche, Abbott, Mindray" />
        </Field>
        <Field
          label="Minimum shelf life (months)"
          htmlFor="minimumShelfLifeMonths"
          hint="A reagent with four months left is a rejected delivery."
        >
          <NumberInput id="minimumShelfLifeMonths" type="number" min={0} defaultValue={0} />
        </Field>
        <Field label="Required delivery (days)" htmlFor="requiredDeliveryDays">
          <NumberInput id="requiredDeliveryDays" type="number" min={0} defaultValue={0} />
        </Field>
        <Field label="Specification" htmlFor="specification" className="sm:col-span-2 lg:col-span-3">
          <TextArea id="specification" rows={2} />
        </Field>
        <Field label="Conditions" htmlFor="conditions" className="sm:col-span-2 lg:col-span-3">
          <TextInput id="conditions" placeholder="Must include installation and training" />
        </Field>
      </div>
    </ActionForm>
  );
}

/** A document the institution requires with the bid. */
export function TenderDocumentForm({ tenderId }: { tenderId: string }) {
  return (
    <ActionForm
      action={saveTenderDocument}
      submitLabel="Add document"
      variant="secondary"
      successMessage="Added."
      className="medi-panel p-5"
    >
      <input type="hidden" name="tenderId" value={tenderId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Document" htmlFor="label" required>
          <TextInput id="label" required placeholder="Tax clearance certificate" />
        </Field>
        <Field label="Expires" htmlFor="expiresAt" hint="Certificates lapse.">
          <TextInput id="expiresAt" type="date" />
        </Field>
        <Field label="Required?" htmlFor="isRequired">
          <Select id="isRequired" defaultValue="1">
            <option value="1">Required</option>
            <option value="0">Optional</option>
          </Select>
        </Field>
        <Field label="Do we have it?" htmlFor="isProvided">
          <Select id="isProvided" defaultValue="0">
            <option value="0">Not yet</option>
            <option value="1">Attached</option>
          </Select>
        </Field>
      </div>
    </ActionForm>
  );
}

/** Start a submission, pre-filled from the published requirements. */
export function StartSubmissionForm({
  tenderId,
  isRevision,
}: {
  tenderId: string;
  isRevision: boolean;
}) {
  return (
    <ActionForm
      action={createTenderSubmission}
      submitLabel={isRevision ? "Start a revision" : "Prepare a submission"}
      variant={isRevision ? "secondary" : "primary"}
      successMessage={isRevision ? "Revision started." : "Submission started."}
      className="medi-panel medi-panel-lg p-5"
    >
      <input type="hidden" name="tenderId" value={tenderId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Our prices hold until" htmlFor="validUntil" hint="Evaluation takes months.">
          <TextInput id="validUntil" type="date" />
        </Field>
        <Field label="Payment terms" htmlFor="paymentTerms">
          <TextInput id="paymentTerms" placeholder="30 days from delivery" />
        </Field>
        <Field label="Delivery terms" htmlFor="deliveryTerms" className="sm:col-span-2">
          <TextInput id="deliveryTerms" placeholder="Delivered to the hospital stores" />
        </Field>
        {isRevision ? (
          <Field
            label="Why is this being revised?"
            htmlFor="revisionReason"
            required
            className="sm:col-span-2"
          >
            <TextInput id="revisionReason" required placeholder="Clarification requested on lot 4" />
          </Field>
        ) : null}
      </div>
      <p className="medi-meta mt-4 text-medi-muted">
        Every line starts marked no-bid, so a line nobody priced is recorded as declined rather than
        submitted at the catalogue price.
      </p>
    </ActionForm>
  );
}

/** Price one line of a draft submission, or decline it. */
export function PriceLineForm({
  item,
}: {
  item: {
    id: string;
    lot: string;
    requirement: string;
    offeredDescription: string;
    offeredBrand: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    unitCostAtBid: number;
    leadTimeDays: number;
    shelfLifeMonths: number;
    isNoBid: boolean;
    deviationNote: string;
  };
}) {
  return (
    <ActionForm
      action={priceSubmissionItem}
      submitLabel="Save line"
      variant="secondary"
      className="medi-panel p-4"
    >
      <input type="hidden" name="itemId" value={item.id} />
      <p className="medi-label mb-3 text-medi-ink">
        {item.lot ? <span className="font-figures mr-2 text-medi-muted">{item.lot}</span> : null}
        {item.requirement}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Bid or decline" htmlFor={`isNoBid-${item.id}`}>
          <Select id={`isNoBid-${item.id}`} name="isNoBid" defaultValue={item.isNoBid ? "1" : "0"}>
            <option value="0">Bidding</option>
            <option value="1">No bid</option>
          </Select>
        </Field>
        <Field label="Quantity" htmlFor={`quantity-${item.id}`}>
          <NumberInput
            id={`quantity-${item.id}`}
            name="quantity"
            type="number"
            min={0}
            defaultValue={item.quantity}
          />
        </Field>
        <Field label="Our price" htmlFor={`unitPrice-${item.id}`}>
          <NumberInput
            id={`unitPrice-${item.id}`}
            name="unitPrice"
            defaultValue={String(toCedis(item.unitPrice))}
          />
        </Field>
        <Field
          label="Our cost"
          htmlFor={`unitCostAtBid-${item.id}`}
          hint="Frozen, so margin on an award is measured against what it cost then."
        >
          <NumberInput
            id={`unitCostAtBid-${item.id}`}
            name="unitCostAtBid"
            defaultValue={String(toCedis(item.unitCostAtBid))}
          />
        </Field>
        <Field label="What we are offering" htmlFor={`offered-${item.id}`} className="sm:col-span-2">
          <TextInput
            id={`offered-${item.id}`}
            name="offeredDescription"
            defaultValue={item.offeredDescription}
          />
        </Field>
        <Field label="Brand" htmlFor={`brand-${item.id}`}>
          <TextInput id={`brand-${item.id}`} name="offeredBrand" defaultValue={item.offeredBrand} />
        </Field>
        <Field label="Lead time (days)" htmlFor={`lead-${item.id}`}>
          <NumberInput
            id={`lead-${item.id}`}
            name="leadTimeDays"
            type="number"
            min={0}
            defaultValue={item.leadTimeDays}
          />
        </Field>
        <Field label="Shelf life offered (months)" htmlFor={`shelf-${item.id}`}>
          <NumberInput
            id={`shelf-${item.id}`}
            name="shelfLifeMonths"
            type="number"
            min={0}
            defaultValue={item.shelfLifeMonths}
          />
        </Field>
        <Field
          label="Deviation from what they asked for"
          htmlFor={`deviation-${item.id}`}
          hint="An undeclared deviation found at evaluation disqualifies the whole bid."
          className="sm:col-span-2 lg:col-span-3"
        >
          <TextInput
            id={`deviation-${item.id}`}
            name="deviationNote"
            defaultValue={item.deviationNote}
            placeholder="Offering 2 × 250 mL against a 500 mL pack"
          />
        </Field>
        <Field label="If declining, why" htmlFor={`noBidReason-${item.id}`} className="sm:col-span-2">
          <TextInput id={`noBidReason-${item.id}`} name="noBidReason" />
        </Field>
      </div>
    </ActionForm>
  );
}

/** Mark a submission as actually sent. */
export function SubmitTenderForm({ submissionId }: { submissionId: string }) {
  return (
    <ActionForm
      action={submitTender}
      submitLabel="Mark as submitted"
      successMessage="Recorded as submitted."
      className="medi-panel medi-panel-lg p-5"
    >
      <input type="hidden" name="submissionId" value={submissionId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Submitted on" htmlFor="submittedAt">
          <TextInput id="submittedAt" type="date" />
        </Field>
        <Field label="How" htmlFor="method">
          <Select id="method" defaultValue="HAND_DELIVERY">
            <option value="HAND_DELIVERY">Hand delivery</option>
            <option value="PORTAL">Portal</option>
            <option value="EMAIL">Email</option>
            <option value="COURIER">Courier</option>
          </Select>
        </Field>
        <Field
          label="Their receipt number"
          htmlFor="receiptReference"
          hint="Proof it arrived before the deadline."
        >
          <TextInput id="receiptReference" />
        </Field>
      </div>
    </ActionForm>
  );
}
