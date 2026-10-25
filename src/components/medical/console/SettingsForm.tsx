"use client";

import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, NumberInput, Select, TextArea, TextInput } from "@/components/medical/console/Field";
import { saveSettings } from "@/lib/medical/admin/staff-actions";

/**
 * One group of settings, saved together.
 *
 * The control is chosen from the value's declared type, which is the point of
 * storing the type at all: a boolean gets two options rather than a text box
 * somebody can type "yes" into, and a number gets a numeric field. A setting
 * whose text cannot be read as its type is refused on save, because the
 * alternative is a value that silently falls back to the default and is
 * discovered months later.
 */
export function SettingsForm({
  group,
  rows,
}: {
  group: string;
  rows: {
    key: string;
    value: string;
    valueType: string;
    label: string;
    helpText: string;
  }[];
}) {
  return (
    <ActionForm
      action={saveSettings}
      submitLabel="Save changes"
      pendingLabel="Saving…"
      successMessage="Saved."
      className="medi-panel medi-panel-lg p-5 sm:p-6"
    >
      <input type="hidden" name="group" value={group} />
      <div className="grid gap-5 sm:grid-cols-2">
        {rows.map((row) => {
          const id = `set-${row.key}`;
          const name = `set:${row.key}`;
          const label = row.label || row.key;

          if (row.valueType === "boolean") {
            return (
              <Field key={row.key} label={label} htmlFor={id} hint={row.helpText}>
                <Select id={id} name={name} defaultValue={row.value === "true" ? "true" : "false"}>
                  <option value="false">Off</option>
                  <option value="true">On</option>
                </Select>
              </Field>
            );
          }

          if (row.valueType === "number") {
            return (
              <Field key={row.key} label={label} htmlFor={id} hint={row.helpText}>
                <NumberInput id={id} name={name} step="any" defaultValue={row.value} />
              </Field>
            );
          }

          if (row.valueType === "json" || row.value.length > 60) {
            return (
              <Field
                key={row.key}
                label={label}
                htmlFor={id}
                hint={row.helpText}
                className="sm:col-span-2"
              >
                <TextArea id={id} name={name} rows={3} defaultValue={row.value} />
              </Field>
            );
          }

          return (
            <Field key={row.key} label={label} htmlFor={id} hint={row.helpText}>
              <TextInput id={id} name={name} defaultValue={row.value} />
            </Field>
          );
        })}
      </div>
    </ActionForm>
  );
}
