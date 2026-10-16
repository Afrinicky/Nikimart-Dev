"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Save, ShieldAlert } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { savePurchaseRecord, type PurchaseState } from "@/lib/retail/purchase-actions";
import { cn } from "@/lib/cn";

/**
 * What the supplier agreed to, and where the proof of it lives.
 *
 * Links rather than uploads: the invoice is already in an inbox and the chat
 * export is already in a drive, and a second copy that can drift from the
 * original is worse than a pointer to it. Only http(s) is stored — the field
 * is free text in an admin console, and a `javascript:` href here would be an
 * XSS with an audience of administrators.
 */
export interface PurchaseRecordValues {
  id: string;
  supplierName: string;
  supplierContact: string;
  supplierOrderNo: string;
  currency: string;
  fxRate: number;
  supplierCost: number;
  invoiceUrl: string;
  receiptUrl: string;
  agreementUrl: string;
  documents: string;
  supplierTracking: string;
  supplierCarrier: string;
  expectedAt: string;
  note: string;
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  hint,
  inputMode,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  placeholder?: string;
  type?: string;
  hint?: string;
  inputMode?: "decimal" | "text";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">{label}</span>
      <input
        name={name}
        type={type}
        inputMode={inputMode}
        defaultValue={defaultValue === 0 ? "" : defaultValue}
        placeholder={placeholder}
        className={cn(inputClass, "py-2 text-sm")}
      />
      {hint ? <span className="mt-1 block text-[11px] text-niki-ink/45">{hint}</span> : null}
    </label>
  );
}

export function PurchaseRecordForm({ values }: { values: PurchaseRecordValues }) {
  const [state, formAction] = useActionState<PurchaseState, FormData>(savePurchaseRecord, {});

  return (
    <form action={formAction} className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <input type="hidden" name="id" value={values.id} />

      <h2 className="font-display font-bold text-niki-ink">The supplier&apos;s side</h2>
      <p className="mt-1 text-xs text-niki-ink/55">
        What was agreed and where the paperwork lives. This is the record a refund would be argued
        from, so fill in whatever you have.
      </p>

      {state.error ? (
        <p
          role="alert"
          className="animate-fade-up mt-3 flex items-start gap-2 rounded-xl bg-niki-danger/10 px-3 py-2.5 text-sm font-medium text-niki-danger"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="animate-fade-up mt-3 flex items-center gap-2 rounded-xl bg-niki-success/10 px-3 py-2.5 text-sm font-medium text-niki-success">
          <Check className="h-4 w-4" />
          {state.message}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Supplier" name="supplierName" defaultValue={values.supplierName} placeholder="Guangzhou Shoe Co" />
        <Field
          label="How they are reached"
          name="supplierContact"
          defaultValue={values.supplierContact}
          placeholder="WeChat, phone or email"
        />
        <Field
          label="Their order number"
          name="supplierOrderNo"
          defaultValue={values.supplierOrderNo}
          placeholder="What they call it on their side"
          hint="Quote this back to them when you chase it."
        />
        <Field
          label="Expected at the forwarder"
          name="expectedAt"
          type="date"
          defaultValue={values.expectedAt}
          hint="What the supplier promised. The tracker counts from this."
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field
          label="Price agreed"
          name="supplierCost"
          inputMode="decimal"
          defaultValue={values.supplierCost}
          placeholder="0.00"
          hint="In their currency."
        />
        <Field label="Currency" name="currency" defaultValue={values.currency} placeholder="USD" />
        <Field
          label="Rate to GH₵"
          name="fxRate"
          inputMode="decimal"
          defaultValue={values.fxRate}
          placeholder="0.00"
          hint="Leave blank if paid in cedis."
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Supplier's tracking number" name="supplierTracking" defaultValue={values.supplierTracking} />
        <Field label="Carrier" name="supplierCarrier" defaultValue={values.supplierCarrier} placeholder="SF Express" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Invoice link" name="invoiceUrl" defaultValue={values.invoiceUrl} placeholder="https://…" />
        <Field label="Receipt link" name="receiptUrl" defaultValue={values.receiptUrl} placeholder="https://…" />
        <Field label="Agreement link" name="agreementUrl" defaultValue={values.agreementUrl} placeholder="https://…" />
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">Other documents</span>
        <textarea
          name="documents"
          rows={3}
          defaultValue={values.documents}
          placeholder={"One per line. \"WeChat export|https://…\" or just the link."}
          className={cn(inputClass, "py-2 text-sm")}
        />
      </label>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">Note</span>
        <textarea
          name="note"
          rows={2}
          defaultValue={values.note}
          placeholder="Anything worth keeping about this purchase"
          className={cn(inputClass, "py-2 text-sm")}
        />
      </label>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="niki-press niki-focus mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-niki-black px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {pending ? "Saving…" : "Save the record"}
    </button>
  );
}
