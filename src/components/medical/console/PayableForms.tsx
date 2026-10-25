"use client";

import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, NumberInput, Select, TextArea, TextInput } from "@/components/medical/console/Field";
import { matchSupplierInvoice, recordSupplierPayment } from "@/lib/medical/procurement/actions";
import { formatPesewas, toCedis } from "@/lib/medical/money";

/** Accept an invoice's differences, with a reason that stays on the record. */
export function MatchInvoiceForm({ invoiceId }: { invoiceId: string }) {
  return (
    <ActionForm
      action={matchSupplierInvoice}
      submitLabel="Accept and allow payment"
      variant="secondary"
      successMessage="Differences accepted. The invoice can now be paid."
      className="medi-panel medi-panel-lg p-5"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field
        label="Why are these differences acceptable?"
        htmlFor="note"
        hint="Kept against the invoice. The next person to look will want to know."
      >
        <TextArea
          id="note"
          required
          placeholder="Agreed the short delivery with the supplier; they will credit the balance."
        />
      </Field>
    </ActionForm>
  );
}

/**
 * Pay a supplier.
 *
 * Defaults to the outstanding balance rather than the invoice total, because
 * on a part-paid invoice the total is the wrong number and the one most likely
 * to be submitted by accident.
 */
export function SupplierPaymentForm({
  invoiceId,
  outstanding,
  currency,
  blocked,
}: {
  invoiceId: string;
  outstanding: number;
  currency: string;
  blocked: boolean;
}) {
  if (blocked) {
    return (
      <div className="medi-panel px-5 py-8 text-center">
        <p className="text-[0.8125rem] font-semibold text-medi-ink">Payment is held</p>
        <p className="medi-prose mx-auto mt-1 text-[0.8125rem] text-medi-body">
          This invoice does not match the order and the delivery. Accept the differences first — the
          server refuses the payment either way, so this is not a button that can be worked around.
        </p>
      </div>
    );
  }

  return (
    <ActionForm
      action={recordSupplierPayment}
      submitLabel="Record payment"
      successMessage="Payment recorded."
      className="medi-panel medi-panel-lg p-5"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`Amount (${currency})`}
          htmlFor="amount"
          required
          hint={`${formatPesewas(outstanding)} outstanding.`}
        >
          <NumberInput id="amount" required defaultValue={String(toCedis(outstanding))} />
        </Field>
        <Field label="Method" htmlFor="method">
          <Select id="method" defaultValue="BANK">
            <option value="BANK">Bank transfer</option>
            <option value="MOMO">Mobile money</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Paid on" htmlFor="paidAt">
          <TextInput id="paidAt" type="date" />
        </Field>
        <Field label="Note" htmlFor="note">
          <TextInput id="note" placeholder="Transfer reference" />
        </Field>
      </div>
    </ActionForm>
  );
}
