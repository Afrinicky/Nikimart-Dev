"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Percent, Plus } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { NETWORK_LIST } from "@/lib/data-bundles/networks";
import { applyMarkup, createBundle, type DataAdminState } from "@/lib/data-bundles/admin-actions";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="niki-press niki-focus flex w-full items-center justify-center gap-2 rounded-xl bg-niki-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-navy-soft disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? busy : label}
    </button>
  );
}

function Result({ state }: { state: DataAdminState }) {
  if (state.error) {
    return (
      <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * Re-price a whole network from its recorded costs in one move — both the
 * retail price and, optionally, the price sub-agents pay.
 */
export function MarkupTool({
  defaultMarkup,
  defaultAgentDiscount,
}: {
  defaultMarkup: number;
  defaultAgentDiscount: number;
}) {
  const [state, formAction] = useActionState<DataAdminState, FormData>(applyMarkup, {});

  return (
    <form action={formAction} className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2">
        <Percent className="h-4 w-4 text-niki-orange" />
        <h2 className="font-display font-bold text-niki-ink">Price from cost</h2>
      </div>
      <p className="text-sm text-niki-ink/60">
        Sets every price on a network to its cost plus this markup, rounded up to the next Cedi.
        Rows with no cost recorded are left untouched.
      </p>
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Network" htmlFor="markup-network">
          <select id="markup-network" name="network" className={inputClass} defaultValue={NETWORK_LIST[0].value}>
            {NETWORK_LIST.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Markup (%)" htmlFor="markupPercent">
          <input
            id="markupPercent"
            name="markupPercent"
            type="number"
            min="0"
            max="500"
            step="1"
            defaultValue={defaultMarkup}
            className={inputClass}
          />
        </Field>
      </div>
      <Field
        label="Agent discount (%)"
        htmlFor="agentDiscountPercent"
        hint="How far under retail your agents buy. Leave blank to leave agent prices alone."
      >
        <input
          id="agentDiscountPercent"
          name="agentDiscountPercent"
          type="number"
          min="0"
          max="90"
          step="1"
          defaultValue={defaultAgentDiscount}
          className={inputClass}
        />
      </Field>
      <Submit label="Apply markup" busy="Re-pricing…" />
    </form>
  );
}

/** Add a size the provider sells that isn't in the ladder yet. */
export function NewBundleForm() {
  const [state, formAction] = useActionState<DataAdminState, FormData>(createBundle, {});

  return (
    <form action={formAction} className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-niki-orange" />
        <h2 className="font-display font-bold text-niki-ink">Add a bundle</h2>
      </div>
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Network" htmlFor="new-network">
          <select id="new-network" name="network" className={inputClass} defaultValue={NETWORK_LIST[0].value}>
            {NETWORK_LIST.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Size (GB)" htmlFor="new-size">
          <input id="new-size" name="sizeGb" type="number" min="0.1" step="0.1" required className={inputClass} />
        </Field>
        <Field label="Cost (GH₵)" htmlFor="new-cost" hint="What the provider charges you">
          <input id="new-cost" name="costPrice" type="number" min="0" step="0.01" className={inputClass} />
        </Field>
        <Field label="Selling price (GH₵)" htmlFor="new-price">
          <input id="new-price" name="price" type="number" min="0.01" step="0.01" required className={inputClass} />
        </Field>
        <Field
          label="Agent price (GH₵)"
          htmlFor="new-agent-price"
          hint="What sub-agents pay. Leave blank to keep it off agent stores."
        >
          <input id="new-agent-price" name="agentPrice" type="number" min="0" step="0.01" className={inputClass} />
        </Field>
      </div>
      <Field label="Validity note" htmlFor="new-validity" hint="Shown under the size on the storefront">
        <input id="new-validity" name="validity" defaultValue="No expiry" className={inputClass} />
      </Field>
      <Submit label="Add bundle" busy="Adding…" />
    </form>
  );
}
