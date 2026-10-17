"use client";

import { useActionState } from "react";
import { inputClass } from "@/components/ui/Field";
import { setRecruitTerms } from "@/lib/affiliate-admin-actions";
import type { AdminActionState } from "@/lib/affiliate-admin-actions";

/**
 * What this affiliate's own recruits are charged, and what they keep of it.
 *
 * Blank follows the programme, which is what everybody does unless an admin
 * says otherwise — so the placeholders show the programme's figures rather
 * than pretending a blank field means zero.
 */
export function RecruitTermsForm({
  id,
  waiver,
  share,
  defaultWaiver,
  defaultShare,
}: {
  id: string;
  waiver: number | null;
  share: number | null;
  defaultWaiver: number;
  defaultShare: number;
}) {
  const [state, action] = useActionState<AdminActionState, FormData>(setRecruitTerms, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-niki-ink/60">Their discount (%)</span>
          <input
            name="referralWaiverPercent"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={waiver ?? ""}
            placeholder={`Default ${defaultWaiver}`}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-niki-ink/60">They keep (%)</span>
          <input
            name="referralSharePercent"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={share ?? ""}
            placeholder={`Default ${defaultShare}`}
            className={inputClass}
          />
        </label>
      </div>
      <p className="text-xs leading-relaxed text-niki-ink/50">
        Blank follows the programme. An explicit 0 means nothing, whatever the default becomes.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-niki-black px-4 py-2 text-xs font-semibold text-white hover:bg-niki-black-soft"
        >
          Save
        </button>
        {state.ok ? <span className="text-xs font-medium text-niki-success">Saved ✓</span> : null}
        {state.error ? (
          <span role="alert" className="text-xs font-medium text-niki-danger">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
