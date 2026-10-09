"use client";

import { useActionState } from "react";
import { BookPlus, Info, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { formatMoney } from "@/lib/format";
import {
  deleteProviderEntry,
  recordProviderEntry,
  type ProviderEntryState,
} from "@/lib/data-bundles/audit-actions";

/**
 * Movements on the provider's wallet that an administrator declares.
 *
 * The readings can only account for what the balance did between two of them.
 * Money put into the wallet before this console was keeping a record, and
 * money that netted off against a day's trading inside a single interval, are
 * both invisible to that arithmetic and cannot be recovered by taking more
 * readings now. They are the movements that leave the books short, so they are
 * entered here instead.
 *
 * Dated by when the money moved rather than when it was typed: a top-up
 * entered today for last March belongs in last March, or every period it
 * passed through is wrong.
 *
 * Nothing entered here touches the provider's balance. That figure is read
 * from the provider and is theirs to state; a console that let an
 * administrator type over it would be a console whose balance proves nothing.
 * These entries are the history beside it — what was put in and when — so
 * funding can be matched against the revenue it paid for.
 */

export interface DeclaredEntry {
  id: string;
  kind: string;
  amount: number;
  occurredAt: string;
  note: string;
  createdByEmail: string;
}

export function ProviderEntryForm({ entries }: { entries: DeclaredEntry[] }) {
  const [state, formAction] = useActionState<ProviderEntryState, FormData>(
    recordProviderEntry,
    {},
  );

  // The date input wants YYYY-MM-DD, and will not accept a day that has not
  // happened: a movement cannot be declared into the future.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <PanelHeading
        title="Record a past movement"
        subtitle="Funding or spending from before the record began, or netted off inside a single reading."
      />

      <p className="mb-5 flex items-start gap-2 rounded-xl bg-niki-surface/70 px-4 py-3 text-[13px] leading-snug text-niki-ink/65">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-niki-ink/40" />
        <span>
          This does not change the provider&apos;s balance, which is always read from the provider
          itself. It records what was put in and when, so funding can be matched against the revenue
          it paid for.
        </span>
      </p>

      <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Movement"
          htmlFor="kind"
          hint="Only what the readings missed"
        >
          <select id="kind" name="kind" defaultValue="FUNDING" className={inputClass}>
            <option value="FUNDING">Funding into the wallet</option>
            <option value="DEBIT">Spending out of it</option>
          </select>
        </Field>

        <Field label="Amount (GH₵)" htmlFor="amount">
          <input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            required
            className={inputClass}
          />
        </Field>

        <Field label="Date it moved" htmlFor="occurredAt" hint="Leave blank for today">
          <input
            id="occurredAt"
            name="occurredAt"
            type="date"
            max={today}
            className={inputClass}
          />
        </Field>

        <Field label="Reference or note" htmlFor="note" hint="Optional">
          <input
            id="note"
            name="note"
            type="text"
            maxLength={300}
            placeholder="MoMo reference, who paid it in…"
            className={inputClass}
          />
        </Field>

        <div className="sm:col-span-2 lg:col-span-4 space-y-3">
          <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />
          <SubmitButton
            pendingLabel="Recording…"
            className="inline-flex items-center gap-2 rounded-xl bg-niki-orange px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            <BookPlus className="h-4 w-4" />
            Record movement
          </SubmitButton>
        </div>
      </form>

      {entries.length > 0 ? <DeclaredList entries={entries} /> : null}
    </section>
  );
}

/**
 * What has been declared, and a way to take it back.
 *
 * A typed figure is the one kind of row in this module that can simply be
 * wrong, so it is the one kind that can be removed. Nothing derived from a
 * reading is removable here, because a reading is a fact and not an opinion.
 */
function DeclaredList({ entries }: { entries: DeclaredEntry[] }) {
  const [state, formAction] = useActionState<ProviderEntryState, FormData>(
    deleteProviderEntry,
    {},
  );

  return (
    <div className="mt-6 border-t border-niki-edge pt-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45">
        Declared movements
      </p>

      <FormFeedback
        error={state.error}
        success={state.ok ? state.message : undefined}
        className="mt-3"
      />

      <ul className="mt-3 divide-y divide-niki-edge/70">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
            <span
              className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                entry.kind === "FUNDING"
                  ? "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/25"
                  : "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/25"
              }`}
            >
              {entry.kind === "FUNDING" ? "Funding" : "Spending"}
            </span>
            <span className="font-figures font-bold tabular-nums text-niki-ink">
              {formatMoney(entry.amount)}
            </span>
            <span className="text-niki-ink/55">{entry.occurredAt}</span>
            {entry.note ? (
              <span className="min-w-0 flex-1 truncate text-xs text-niki-ink/50">{entry.note}</span>
            ) : (
              <span className="flex-1" />
            )}
            {entry.createdByEmail ? (
              <span className="hidden text-xs text-niki-ink/40 sm:inline">
                {entry.createdByEmail}
              </span>
            ) : null}
            <form action={formAction}>
              <input type="hidden" name="id" value={entry.id} />
              <SubmitButton
                pendingLabel="Removing…"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/50 ring-1 ring-niki-edge transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
