"use client";

import { useActionState, useState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { saveRewardTier, type RewardAdminState } from "@/lib/data-bundles/leaderboard-actions";
import { NETWORK_LIST } from "@/lib/data-bundles/networks";

/**
 * One reward, added or edited.
 *
 * A reward is either cedis or a bundle, never both, so the form asks for one
 * or the other rather than showing eight fields and hoping. What it costs in
 * points is the only thing every reward has, and it is the field an admin
 * actually tunes.
 */
export function RewardTierForm({
  tier,
}: {
  /** Absent when adding. */
  tier?: {
    id: string;
    label: string;
    kind: string;
    points: number;
    cashAmount: number;
    network: string;
    sizeGb: number;
    order: number;
    isActive: boolean;
  };
}) {
  const [state, formAction] = useActionState<RewardAdminState, FormData>(saveRewardTier, {});
  const [kind, setKind] = useState(tier?.kind === "BUNDLE" ? "BUNDLE" : "CASH");

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {tier ? <input type="hidden" name="id" value={tier.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reward name" htmlFor={`label-${tier?.id ?? "new"}`}>
          <input
            id={`label-${tier?.id ?? "new"}`}
            name="label"
            defaultValue={tier?.label ?? ""}
            maxLength={60}
            placeholder="e.g. GH₵20 cash"
            className={inputClass}
          />
        </Field>
        <Field
          label="Costs (points)"
          htmlFor={`points-${tier?.id ?? "new"}`}
          hint="What an agent spends to claim it"
        >
          <input
            id={`points-${tier?.id ?? "new"}`}
            name="points"
            type="number"
            min="1"
            step="1"
            defaultValue={tier?.points ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reward type" htmlFor={`kind-${tier?.id ?? "new"}`}>
          <select
            id={`kind-${tier?.id ?? "new"}`}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={inputClass}
          >
            <option value="CASH">Cash — credited to their balance</option>
            <option value="BUNDLE">Data bundle — sent to a number they give</option>
          </select>
        </Field>

        {kind === "CASH" ? (
          <Field
            label="Cash amount (GH₵)"
            htmlFor={`cashAmount-${tier?.id ?? "new"}`}
            hint="Credited to the agent's balance when you approve the claim"
          >
            <input
              id={`cashAmount-${tier?.id ?? "new"}`}
              name="cashAmount"
              type="number"
              min="0"
              step="0.5"
              defaultValue={tier?.cashAmount || ""}
              className={inputClass}
            />
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Network" htmlFor={`network-${tier?.id ?? "new"}`}>
              <select
                id={`network-${tier?.id ?? "new"}`}
                name="network"
                defaultValue={tier?.network || NETWORK_LIST[0]?.value}
                className={inputClass}
              >
                {NETWORK_LIST.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Size (GB)" htmlFor={`sizeGb-${tier?.id ?? "new"}`}>
              <input
                id={`sizeGb-${tier?.id ?? "new"}`}
                name="sizeGb"
                type="number"
                min="0"
                step="0.5"
                defaultValue={tier?.sizeGb || ""}
                className={inputClass}
              />
            </Field>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Availability"
          htmlFor={`isActive-${tier?.id ?? "new"}`}
          hint="Off takes it off the shelf without deleting it"
        >
          <select
            id={`isActive-${tier?.id ?? "new"}`}
            name="isActive"
            defaultValue={tier && !tier.isActive ? "0" : "1"}
            className={inputClass}
          >
            <option value="1">On the shelf</option>
            <option value="0">Hidden from agents</option>
          </select>
        </Field>
        <Field
          label="Sort order"
          htmlFor={`order-${tier?.id ?? "new"}`}
          hint="Lower shows first. Equal orders fall back to price."
        >
          <input
            id={`order-${tier?.id ?? "new"}`}
            name="order"
            type="number"
            step="1"
            defaultValue={tier?.order ?? 0}
            className={inputClass}
          />
        </Field>
      </div>

      <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />
      <SubmitButton>{tier ? "Save reward" : "Add reward"}</SubmitButton>
    </form>
  );
}
