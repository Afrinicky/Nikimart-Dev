"use client";

import { useActionState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import {
  saveServiceSettings,
  type ServiceAdminState,
} from "@/lib/data-bundles/service-admin-actions";

/**
 * Where the services shelf is shown, and how heavy a document may be.
 *
 * Three switches rather than one, because "open" and "advertised" are
 * different questions. A service can be sold through agents while Nickimart's
 * own pages say nothing about it — which is how a new service is tried out
 * before it goes on the front page.
 */

function Switch({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-niki-surface px-4 py-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-[var(--color-niki-orange,#ff6a00)]"
      />
      <span>
        <span className="block text-sm font-semibold text-niki-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-niki-ink/55">{hint}</span>
      </span>
    </label>
  );
}

export function ServiceSettingsForm({
  initial,
}: {
  initial: {
    enabled: boolean;
    onStore: boolean;
    onHomepage: boolean;
    heading: string;
    blurb: string;
    maxUploadMb: number;
  };
}) {
  const [state, submit, saving] = useActionState<ServiceAdminState, FormData>(
    saveServiceSettings,
    {},
  );

  return (
    <form action={submit} className="space-y-4">
      {state.error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="animate-fade-up flex items-center gap-2 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
          <Check className="h-4 w-4" />
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Switch
          name="enabled"
          label="Services open"
          hint="Off closes the whole shelf, everywhere."
          defaultChecked={initial.enabled}
        />
        <Switch
          name="onStore"
          label="On the bundle store"
          hint="Adds a Services tab beside the networks."
          defaultChecked={initial.onStore}
        />
        <Switch
          name="onHomepage"
          label="On the Nickimart homepage"
          hint="Adds a section to the main site."
          defaultChecked={initial.onHomepage}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Section heading" htmlFor="heading">
          <input
            id="heading"
            name="heading"
            defaultValue={initial.heading}
            className={inputClass}
          />
        </Field>
        <Field
          label="Document size limit"
          htmlFor="maxUploadMb"
          hint="Megabytes per file, 0.5 to 10"
        >
          <input
            id="maxUploadMb"
            name="maxUploadMb"
            type="number"
            min={0.5}
            max={10}
            step={0.5}
            defaultValue={initial.maxUploadMb}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Section line" htmlFor="blurb" hint="One line under the heading">
        <input id="blurb" name="blurb" defaultValue={initial.blurb} className={inputClass} />
      </Field>

      <button
        type="submit"
        disabled={saving}
        className="niki-press flex items-center gap-2 rounded-xl bg-niki-orange px-5 py-3 text-sm font-bold text-white hover:bg-niki-orange-light disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
