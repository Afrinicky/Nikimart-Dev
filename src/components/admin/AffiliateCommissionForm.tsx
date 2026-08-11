"use client";

import { useActionState } from "react";
import { inputClass } from "@/components/ui/Field";
import { setAffiliateCommission, type CommissionState } from "@/lib/finance-actions";

export function AffiliateCommissionForm({ id, current, defaultRate }: { id: string; current: number | null; defaultRate: number }) {
  const [state, formAction] = useActionState<CommissionState, FormData>(setAffiliateCommission, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-niki-ink/60">Fallback commission rate (%)</span>
        <input name="commissionRate" type="number" min="0" max="100" step="0.1" defaultValue={current ?? ""} placeholder={`Default ${defaultRate}`} className={`${inputClass} w-40`} />
        <span className="mt-1 block max-w-sm text-xs text-niki-ink/50">
          Used only for enrolled products that set no rate of their own. A product&apos;s own rate —
          and the cap on NikiMart-funded enrolments — always wins, so this can&apos;t make a seller
          pay more than they agreed to.
        </span>
      </label>
      <button type="submit" className="rounded-full bg-niki-navy px-4 py-2 text-xs font-semibold text-white hover:bg-niki-navy-light">Save</button>
      {state.ok ? <span className="text-xs font-medium text-niki-success">Saved ✓</span> : null}
      {state.error ? <span className="text-xs font-medium text-niki-danger">{state.error}</span> : null}
    </form>
  );
}
