"use client";

import { ActionForm } from "@/components/medical/console/ActionForm";
import type { FormRow } from "@/lib/medical/admin/for-form";
import { Field, FieldSet, NumberInput, Select, TextArea, TextInput } from "@/components/medical/console/Field";
import { saveInstitution } from "@/lib/medical/admin/institution-actions";

const KINDS = [
  ["HOSPITAL", "Hospital"],
  ["LABORATORY", "Laboratory"],
  ["CLINIC", "Clinic"],
  ["PHARMACY", "Pharmacy"],
  ["RESEARCH", "Research institute"],
  ["ACADEMIC", "University or college"],
  ["GOVERNMENT", "Government body"],
  ["NGO", "NGO"],
  ["DISTRIBUTOR", "Distributor"],
  ["OTHER", "Other"],
] as const;

/**
 * Register an institution.
 *
 * The registration number and tax ID are here because a proforma invoice an
 * institution submits to its own finance office is rejected without them, and
 * chasing them at the moment a document is needed is how a week is lost.
 */
export function InstitutionForm({
  institution,
  canSetCredit,
}: {
  /** A row flattened by `forForm`, never the Prisma row: a Decimal cannot
   * cross into a client component. */
  institution?: FormRow & { id: string };
  canSetCredit: boolean;
}) {
  const value = (key: string) => (institution?.[key] as string | undefined) ?? "";

  return (
    <ActionForm
      action={saveInstitution}
      submitLabel={institution ? "Save changes" : "Add institution"}
      successMessage={institution ? "Saved." : "Institution added."}
      className="medi-panel medi-panel-lg space-y-7 p-5 sm:p-6"
    >
      {institution ? <input type="hidden" name="id" value={institution.id} /> : null}

      <FieldSet legend="Who they are">
        <Field label="Name" htmlFor="name" required className="sm:col-span-2">
          <TextInput id="name" required defaultValue={value("name")} />
        </Field>
        <Field label="Kind" htmlFor="kind">
          <Select id="kind" defaultValue={value("kind") || "HOSPITAL"}>
            {KINDS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Registration number"
          htmlFor="registrationNo"
          hint="Needed on a proforma their finance office will accept."
        >
          <TextInput id="registrationNo" defaultValue={value("registrationNo")} />
        </Field>
        <Field label="Tax identification" htmlFor="taxId">
          <TextInput id="taxId" defaultValue={value("taxId")} />
        </Field>
      </FieldSet>

      <FieldSet legend="How to reach them">
        <Field label="Email" htmlFor="email">
          <TextInput id="email" type="email" defaultValue={value("email")} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <TextInput id="phone" defaultValue={value("phone")} />
        </Field>
        <Field label="Address" htmlFor="addressLine1">
          <TextInput id="addressLine1" defaultValue={value("addressLine1")} />
        </Field>
        <Field label="City" htmlFor="city">
          <TextInput id="city" defaultValue={value("city")} />
        </Field>
        <Field label="Region" htmlFor="region">
          <TextInput id="region" defaultValue={value("region")} />
        </Field>
        <Field label="Digital address" htmlFor="digitalAddress">
          <TextInput id="digitalAddress" defaultValue={value("digitalAddress")} />
        </Field>
      </FieldSet>

      <FieldSet legend="How they buy">
        <Field label="Default payment terms" htmlFor="defaultPaymentTerms" className="sm:col-span-2">
          <TextInput
            id="defaultPaymentTerms"
            defaultValue={value("defaultPaymentTerms")}
            placeholder="30 days from delivery"
          />
        </Field>
        {canSetCredit ? (
          <>
            <Field
              label="Credit approved?"
              htmlFor="creditApproved"
              hint="A finance decision. Gates whether instalment terms may be offered at all."
            >
              <Select
                id="creditApproved"
                defaultValue={institution?.creditApproved ? "1" : "0"}
              >
                <option value="0">Not approved</option>
                <option value="1">Approved</option>
              </Select>
            </Field>
            <Field label="Credit limit" htmlFor="creditLimit">
              <NumberInput id="creditLimit" defaultValue={String(institution?.creditLimit ?? "0")} />
            </Field>
          </>
        ) : null}
        <Field label="Status" htmlFor="isActive">
          <Select id="isActive" defaultValue={institution?.isActive === false ? "0" : "1"}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </Select>
        </Field>
      </FieldSet>

      <FieldSet legend="Notes" columns={1}>
        <Field label="About" htmlFor="about" hint="What they do. Read by whoever prices their quotation.">
          <TextArea id="about" defaultValue={value("about")} />
        </Field>
      </FieldSet>
    </ActionForm>
  );
}
