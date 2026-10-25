"use client";

import { ActionForm } from "@/components/medical/console/ActionForm";
import type { FormRow } from "@/lib/medical/admin/for-form";
import { Field, FieldSet, NumberInput, Select, TextArea, TextInput } from "@/components/medical/console/Field";
import { saveTender } from "@/lib/medical/tenders/actions";
import { toDateInput } from "@/lib/medical/format";

/**
 * Record a procurement exercise.
 *
 * The dates are a group of their own and there are six of them, because six of
 * them matter and a single "deadline" field is how a submission gets prepared
 * against the advertisement date. The renewal date is the one worth the most:
 * it is what turns a one-off bid into a pipeline, and nothing else in the
 * system will remind anybody that Korle Bu runs this exercise every March.
 */
export function TenderForm({
  tender,
  organisations,
}: {
  /** A row flattened by `forForm`, never the Prisma row: a Decimal cannot
   * cross into a client component. */
  tender?: FormRow & { id: string };
  organisations: { id: string; name: string }[];
}) {
  const value = (key: string) => (tender?.[key] as string | undefined) ?? "";
  const dateValue = (key: string) => toDateInput(tender?.[key] as Date | undefined);

  return (
    <ActionForm
      action={saveTender}
      submitLabel={tender ? "Save changes" : "Record tender"}
      successMessage={tender ? "Saved." : "Tender recorded."}
      className="medi-panel medi-panel-lg space-y-7 p-5 sm:p-6"
    >
      {tender ? <input type="hidden" name="id" value={tender.id} /> : null}

      <FieldSet legend="The exercise">
        <Field label="Institution" htmlFor="organisationId" required>
          <Select id="organisationId" required defaultValue={value("organisationId")}>
            <option value="">Choose an institution…</option>
            {organisations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Their tender number"
          htmlFor="tenderNumber"
          hint="The number on the advertisement. Every document they send will quote it."
        >
          <TextInput id="tenderNumber" defaultValue={value("tenderNumber")} />
        </Field>
        <Field label="Title" htmlFor="title" required className="sm:col-span-2">
          <TextInput
            id="title"
            required
            defaultValue={value("title")}
            placeholder="Supply of laboratory reagents and consumables"
          />
        </Field>
        <Field label="Kind" htmlFor="kind">
          <Select id="kind" defaultValue={value("kind") || "OPEN"}>
            <option value="OPEN">Open tender</option>
            <option value="RESTRICTED">Restricted</option>
            <option value="FRAMEWORK">Framework agreement</option>
            <option value="RENEWAL">Renewal</option>
            <option value="RFQ">Request for quotation</option>
            <option value="DIRECT">Direct award</option>
          </Select>
        </Field>
        <Field label="Cycle" htmlFor="cycle" hint="Their naming: “2026 first half”.">
          <TextInput id="cycle" defaultValue={value("cycle")} />
        </Field>
      </FieldSet>

      <FieldSet
        legend="Dates"
        description="Six of them, because six matter. The renewal date is what turns one bid into a pipeline."
        columns={3}
      >
        <Field label="Advertised" htmlFor="advertisedAt">
          <TextInput id="advertisedAt" type="date" defaultValue={dateValue("advertisedAt")} />
        </Field>
        <Field
          label="Submission deadline"
          htmlFor="submissionDeadline"
          hint="The one that ends it."
        >
          <TextInput
            id="submissionDeadline"
            type="date"
            defaultValue={dateValue("submissionDeadline")}
          />
        </Field>
        <Field label="Bids opened" htmlFor="opensAt">
          <TextInput id="opensAt" type="date" defaultValue={dateValue("opensAt")} />
        </Field>
        <Field label="Award expected" htmlFor="awardExpectedAt">
          <TextInput id="awardExpectedAt" type="date" defaultValue={dateValue("awardExpectedAt")} />
        </Field>
        <Field label="Contract starts" htmlFor="contractStartAt">
          <TextInput id="contractStartAt" type="date" defaultValue={dateValue("contractStartAt")} />
        </Field>
        <Field
          label="Contract ends"
          htmlFor="contractEndAt"
          hint="Awarded prices hold until this date."
        >
          <TextInput id="contractEndAt" type="date" defaultValue={dateValue("contractEndAt")} />
        </Field>
        <Field
          label="Next exercise expected"
          htmlFor="renewalDueAt"
          hint="When they will run this again. Surfaced on the overview."
        >
          <TextInput id="renewalDueAt" type="date" defaultValue={dateValue("renewalDueAt")} />
        </Field>
      </FieldSet>

      <FieldSet legend="Commercial">
        <Field
          label="Estimated value"
          htmlFor="estimatedValue"
          hint="For pipeline reporting. Labelled as an estimate everywhere it is shown."
        >
          <NumberInput id="estimatedValue" defaultValue={String(tender?.estimatedValue ?? "0")} />
        </Field>
        <Field label="Cost to bid" htmlFor="bidCost" hint="Document fees, bid bonds.">
          <NumberInput id="bidCost" defaultValue={String(tender?.bidCost ?? "0")} />
        </Field>
        <Field label="How we found it" htmlFor="sourcedVia">
          <Select id="sourcedVia" defaultValue={value("sourcedVia")}>
            <option value="">Not recorded</option>
            <option value="ADVERTISEMENT">Advertisement</option>
            <option value="INVITATION">Invitation</option>
            <option value="PORTAL">Procurement portal</option>
            <option value="RELATIONSHIP">Existing relationship</option>
          </Select>
        </Field>
        <Field label="Portal link" htmlFor="portalUrl">
          <TextInput id="portalUrl" defaultValue={value("portalUrl")} />
        </Field>
      </FieldSet>

      <FieldSet legend="Notes" columns={1}>
        <Field label="Description" htmlFor="description">
          <TextArea id="description" defaultValue={value("description")} />
        </Field>
        <Field
          label="Internal notes"
          htmlFor="internalNotes"
          hint="Who we are bidding against, where we can afford to go. Never printed on a document."
        >
          <TextArea id="internalNotes" defaultValue={value("internalNotes")} />
        </Field>
      </FieldSet>
    </ActionForm>
  );
}
