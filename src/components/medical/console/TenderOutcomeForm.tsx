"use client";

import { Info } from "lucide-react";
import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, TextInput } from "@/components/medical/console/Field";
import { recordTenderOutcome } from "@/lib/medical/tenders/actions";
import { formatPesewas, toCedis } from "@/lib/medical/money";

/**
 * Record what came back, line by line.
 *
 * The screen the whole tender section is for. Forty lines come back with
 * several different answers and this is the only place that can hold that: a
 * single "did we win?" control would force somebody to reduce eleven awarded,
 * twenty-six lost and three part-awarded into one word, and the business would
 * learn nothing from the record afterwards.
 *
 * Awarded quantity and awarded price are separate from what was offered,
 * because institutions routinely award a reduced quantity, at a price they
 * name, to more than one supplier.
 */
export function TenderOutcomeForm({
  submissionId,
  items,
}: {
  submissionId: string;
  items: {
    id: string;
    lot: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    isNoBid: boolean;
    outcome: string;
    awardedQuantity: number;
    awardedUnitPrice: number;
    awardedToOther: string;
  }[];
}) {
  const bid = items.filter((item) => !item.isNoBid);

  if (bid.length === 0) {
    return (
      <div className="medi-panel px-5 py-10 text-center">
        <p className="text-[0.875rem] font-semibold text-medi-ink">Nothing was bid on this one.</p>
        <p className="medi-meta mt-1 text-medi-muted">
          Every line is marked no-bid, so there is no outcome to record.
        </p>
      </div>
    );
  }

  return (
    <ActionForm
      action={recordTenderOutcome}
      submitLabel="Record outcome"
      pendingLabel="Recording…"
      successMessage="Outcome recorded."
      className="medi-panel medi-panel-lg p-5 sm:p-6"
    >
      <input type="hidden" name="submissionId" value={submissionId} />

      <div className="mb-5 max-w-xs">
        <Field label="Award date" htmlFor="awardedAt">
          <TextInput id="awardedAt" type="date" />
        </Field>
      </div>

      <div className="relative -mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-medi-mint-50">
              {["Lot", "Line", "Offered", "Outcome", "Qty awarded", "Price awarded", "Awarded to"].map(
                (label, index, all) => (
                  <th
                    key={label}
                    className={[
                      "px-3 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted",
                      index === 0 ? "rounded-l-xl text-left" : "",
                      index === all.length - 1 ? "rounded-r-xl text-left" : "",
                      index > 0 && index < all.length - 1 ? "text-left" : "",
                    ].join(" ")}
                  >
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-medi-rule">
            {bid.map((item) => (
              <tr key={item.id}>
                <td className="font-figures px-3 py-3 align-top text-[0.8125rem] text-medi-muted">
                  {item.lot || "—"}
                </td>
                <td className="px-3 py-3 align-top">
                  <span className="text-[0.8125rem] font-semibold text-medi-ink">
                    {item.description}
                  </span>
                </td>
                <td className="font-figures px-3 py-3 align-top text-[0.8125rem] text-medi-body">
                  {item.quantity} {item.unit}
                  <span className="medi-meta mt-0.5 block text-medi-muted">
                    at {formatPesewas(item.unitPrice)}
                  </span>
                </td>
                <td className="px-3 py-3 align-top">
                  <label className="sr-only" htmlFor={`outcome-${item.id}`}>
                    Outcome for {item.description}
                  </label>
                  <select
                    id={`outcome-${item.id}`}
                    name={`outcome:${item.id}`}
                    defaultValue={item.outcome}
                    className="medi-focus h-9 w-40 rounded-lg bg-white px-2 text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)]"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="AWARDED">Awarded</option>
                    <option value="PARTIALLY_AWARDED">Part awarded</option>
                    <option value="NOT_AWARDED">Not awarded</option>
                    <option value="WITHDRAWN">Withdrawn</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </td>
                <td className="px-3 py-3 align-top">
                  <label className="sr-only" htmlFor={`qty-${item.id}`}>
                    Quantity awarded for {item.description}
                  </label>
                  <input
                    id={`qty-${item.id}`}
                    name={`awardedQuantity:${item.id}`}
                    type="number"
                    min={0}
                    defaultValue={item.awardedQuantity || item.quantity}
                    className="medi-focus font-figures h-9 w-24 rounded-lg bg-white px-2 text-right text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </td>
                <td className="px-3 py-3 align-top">
                  <label className="sr-only" htmlFor={`price-${item.id}`}>
                    Price awarded for {item.description}
                  </label>
                  <input
                    id={`price-${item.id}`}
                    name={`awardedPrice:${item.id}`}
                    inputMode="decimal"
                    defaultValue={String(
                      toCedis(item.awardedUnitPrice > 0 ? item.awardedUnitPrice : item.unitPrice),
                    )}
                    className="medi-focus font-figures h-9 w-28 rounded-lg bg-white px-2 text-right text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)]"
                  />
                </td>
                <td className="px-3 py-3 align-top">
                  <label className="sr-only" htmlFor={`other-${item.id}`}>
                    Who it went to instead, for {item.description}
                  </label>
                  <input
                    id={`other-${item.id}`}
                    name={`awardedToOther:${item.id}`}
                    defaultValue={item.awardedToOther}
                    placeholder="If we lost it"
                    className="medi-focus h-9 w-40 rounded-lg bg-white px-2 text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] placeholder:text-medi-muted"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="medi-meta mt-4 flex items-start gap-2 rounded-xl bg-medi-info-soft px-3.5 py-3 text-medi-info">
        <Info className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          An award adds the line to the institution&rsquo;s approved register — permission to supply
          at that price until the contract ends. It does <strong>not</strong> create an order, an
          invoice or revenue. The hospital still has to raise a purchase order against it.
        </span>
      </p>
    </ActionForm>
  );
}
