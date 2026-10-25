"use client";

import { ClipboardCheck } from "lucide-react";
import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, NumberInput, Select, TextArea, TextInput } from "@/components/medical/console/Field";
import {
  recordStockAdjustment,
  setBatchQuarantine,
} from "@/lib/medical/inventory/actions";
import { setReorderPoint } from "@/lib/medical/admin/catalogue-actions";
import { formatDate } from "@/lib/medical/format";

/**
 * Correcting a stock figure by hand.
 *
 * The reason is required by the action, not just by this form: a count that
 * finds four fewer than the system says is a real event and the system has to
 * be able to record it, but what it must never become is a convenient way to
 * make the figures agree. The kind makes somebody say what sort of loss it was,
 * and damage and expiry take their sign from the kind so a keying slip cannot
 * add stock.
 */
export function StockAdjustmentForm({
  productId,
  unitOfSale,
  onHand,
  batches,
}: {
  productId: string;
  unitOfSale: string;
  onHand: number;
  batches: { id: string; batchNumber: string; expiryDate: Date | string | null; remaining: number }[];
}) {
  return (
    <ActionForm
      action={recordStockAdjustment}
      submitLabel="Record adjustment"
      pendingLabel="Recording…"
      successMessage="Recorded."
      className="medi-panel medi-panel-lg p-5 sm:p-6"
    >
      <input type="hidden" name="productId" value={productId} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="What happened" htmlFor="kind" required>
          <Select id="kind" defaultValue="ADJUSTMENT">
            <option value="ADJUSTMENT">Count correction</option>
            <option value="DAMAGE">Damaged</option>
            <option value="EXPIRY">Expired on the shelf</option>
            <option value="RETURN">Returned by a customer</option>
            <option value="OPENING">Opening balance</option>
          </Select>
        </Field>
        <Field
          label={`Units (${unitOfSale})`}
          htmlFor="delta"
          required
          hint={`${onHand} on hand. Negative takes away.`}
        >
          <NumberInput id="delta" step="1" required placeholder="-4" />
        </Field>
        {batches.length > 0 ? (
          <Field
            label="Against a batch"
            htmlFor="batchId"
            hint="Where the loss belongs to one."
            className="lg:col-span-2"
          >
            <Select id="batchId" defaultValue="">
              <option value="">Not batch-specific</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.batchNumber || batch.id.slice(-6)} · {batch.remaining} left
                  {batch.expiryDate ? ` · expires ${formatDate(batch.expiryDate)}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field
          label="Reason"
          htmlFor="reason"
          required
          hint="Required. It is what the next person reads."
          className="sm:col-span-2 lg:col-span-4"
        >
          <TextInput
            id="reason"
            required
            placeholder="Stock count 24 October: four fewer than the system showed."
          />
        </Field>
      </div>

      <p className="medi-meta mt-4 flex items-start gap-2 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
        <ClipboardCheck className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          Damage and expiry always take stock away, whichever sign is typed. Every adjustment writes
          a movement and an audit entry, so the counter can always be explained.
        </span>
      </p>
    </ActionForm>
  );
}

/** The reorder point, editable where somebody is looking at what ran out. */
export function ReorderPointForm({
  productId,
  reorderLevel,
  reorderQuantity,
  unitOfSale,
}: {
  productId: string;
  reorderLevel: number;
  reorderQuantity: number;
  unitOfSale: string;
}) {
  return (
    <ActionForm
      action={setReorderPoint}
      submitLabel="Save reorder point"
      pendingLabel="Saving…"
      variant="secondary"
      successMessage="Saved."
      className="medi-panel p-5"
    >
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`Reorder at (${unitOfSale})`}
          htmlFor="reorderLevel"
          hint="Free stock at or below this is flagged. Zero means never flagged."
        >
          <NumberInput id="reorderLevel" min="0" defaultValue={String(reorderLevel)} />
        </Field>
        <Field label="Reorder quantity" htmlFor="reorderQuantity" hint="What a sourcing round asks for.">
          <NumberInput id="reorderQuantity" min="0" defaultValue={String(reorderQuantity)} />
        </Field>
      </div>
    </ActionForm>
  );
}

/**
 * Holding a batch back from sale, or releasing it.
 *
 * No stock moves: the units are where they were and the counter is unchanged.
 * What changes is whether they may be drawn — held stock stays in the valuation
 * because the money is still tied up in it, and leaves availability because no
 * customer can be promised it.
 */
export function QuarantineForm({
  batchId,
  batchNumber,
  quarantined,
  remaining,
}: {
  batchId: string;
  batchNumber: string;
  quarantined: boolean;
  remaining: number;
}) {
  return (
    <ActionForm
      action={setBatchQuarantine}
      submitLabel={quarantined ? "Release to sale" : "Hold back"}
      pendingLabel="Saving…"
      variant={quarantined ? "secondary" : "danger"}
      successMessage={quarantined ? "Released." : "Held."}
      className="min-w-0"
    >
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="quarantine" value={quarantined ? "0" : "1"} />
      {quarantined ? (
        <p className="medi-meta text-medi-body">
          {remaining} units of {batchNumber || "this batch"} can be drawn again.
        </p>
      ) : (
        <Field
          label={`Why hold ${batchNumber || "this batch"} back?`}
          htmlFor={`qreason-${batchId}`}
          hint="Recalled, damaged, awaiting a certificate. It stays on the batch."
        >
          <TextArea id={`qreason-${batchId}`} name="reason" rows={2} required />
        </Field>
      )}
    </ActionForm>
  );
}
