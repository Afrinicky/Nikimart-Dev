"use client";

import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, FieldSet, NumberInput, Select, TextArea, TextInput } from "@/components/medical/console/Field";
import { saveSupplier } from "@/lib/medical/procurement/actions";

/**
 * Add or edit a supplier.
 *
 * Grouped by the question each section answers — who they are, how to reach
 * them, how they trade — rather than by column order. A twenty-field form in
 * one column is one people fill in wrongly; three short groups with headings
 * is one they can check.
 *
 * The supplier code is not on the form. It is generated, because a code
 * somebody invents collides the first time two people add the same supplier.
 */
export function SupplierForm({
  supplier,
}: {
  supplier?: {
    id: string;
    name: string;
    kind: string;
    country: string;
    currency: string;
    contactName: string;
    email: string;
    phone: string;
    website: string;
    addressLine1: string;
    city: string;
    region: string;
    leadTimeDays: number;
    minimumOrderValue: unknown;
    paymentTermsDays: number;
    paymentDetails: string;
    notes: string;
    rating: number;
    isActive: boolean;
  };
}) {
  return (
    <ActionForm
      action={saveSupplier}
      submitLabel={supplier ? "Save changes" : "Add supplier"}
      successMessage={supplier ? "Saved." : "Supplier added."}
      className="medi-panel medi-panel-lg space-y-7 p-5 sm:p-6"
    >
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}

      <FieldSet legend="Who they are">
        <Field label="Name" htmlFor="name" required className="sm:col-span-2">
          <TextInput id="name" required defaultValue={supplier?.name} autoComplete="off" />
        </Field>
        <Field label="Where they are" htmlFor="kind">
          <Select id="kind" defaultValue={supplier?.kind ?? "LOCAL"}>
            <option value="LOCAL">Ghana</option>
            <option value="INTERNATIONAL">International</option>
          </Select>
        </Field>
        <Field label="Country" htmlFor="country">
          <TextInput id="country" defaultValue={supplier?.country ?? "Ghana"} />
        </Field>
      </FieldSet>

      <FieldSet legend="How to reach them">
        <Field label="Contact name" htmlFor="contactName">
          <TextInput id="contactName" defaultValue={supplier?.contactName} />
        </Field>
        <Field label="Email" htmlFor="email">
          <TextInput id="email" type="email" defaultValue={supplier?.email} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <TextInput id="phone" defaultValue={supplier?.phone} />
        </Field>
        <Field label="Website" htmlFor="website">
          <TextInput id="website" defaultValue={supplier?.website} />
        </Field>
        <Field label="Address" htmlFor="addressLine1">
          <TextInput id="addressLine1" defaultValue={supplier?.addressLine1} />
        </Field>
        <Field label="City" htmlFor="city">
          <TextInput id="city" defaultValue={supplier?.city} />
        </Field>
      </FieldSet>

      <FieldSet
        legend="How they trade"
        description="Used to price a sourcing round and to date a purchase order. Never shown to a customer."
      >
        <Field
          label="Currency"
          htmlFor="currency"
          hint="Their prices are quoted in this, and converted at the rate on each order."
        >
          <TextInput id="currency" defaultValue={supplier?.currency ?? "GHS"} maxLength={3} />
        </Field>
        <Field label="Lead time (days)" htmlFor="leadTimeDays" hint="Order to our store.">
          <NumberInput id="leadTimeDays" type="number" min={0} defaultValue={supplier?.leadTimeDays ?? 14} />
        </Field>
        <Field
          label="Minimum order"
          htmlFor="minimumOrderValue"
          hint="In their currency. Zero if they have none."
        >
          <NumberInput
            id="minimumOrderValue"
            defaultValue={supplier ? String(supplier.minimumOrderValue) : "0"}
          />
        </Field>
        <Field
          label="Payment terms (days)"
          htmlFor="paymentTermsDays"
          hint="Zero means payment with order."
        >
          <NumberInput
            id="paymentTermsDays"
            type="number"
            min={0}
            defaultValue={supplier?.paymentTermsDays ?? 0}
          />
        </Field>
        <Field label="Payment details" htmlFor="paymentDetails" className="sm:col-span-2">
          <TextInput id="paymentDetails" defaultValue={supplier?.paymentDetails} />
        </Field>
      </FieldSet>

      <FieldSet legend="Our view of them" columns={1}>
        <Field
          label="Notes"
          htmlFor="notes"
          hint="Reliability, who to call, what they are slow at. Internal."
        >
          <TextArea id="notes" defaultValue={supplier?.notes} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rating" htmlFor="rating" hint="0 to 5, set by the buyer.">
            <NumberInput id="rating" type="number" min={0} max={5} defaultValue={supplier?.rating ?? 0} />
          </Field>
          <Field label="Status" htmlFor="isActive">
            <Select id="isActive" defaultValue={supplier?.isActive === false ? "0" : "1"}>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </Select>
          </Field>
        </div>
      </FieldSet>
    </ActionForm>
  );
}
