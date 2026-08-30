"use client";

import { useState } from "react";
import { Clock3 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import {
  EMPTY_PREORDER_TERMS,
  serialisePreorderTerms,
  type PreorderTerms,
} from "@/lib/preorder";

/**
 * The preorder arrangement, written by whoever lists the product.
 *
 * A preorder buyer is paying now for something that will be sourced and
 * shipped weeks later, so these answers are the difference between a purchase
 * and a leap of faith: when it should arrive, how much is due up front, what
 * happens to their money if it never comes. Everything here is shown back to
 * the buyer on the product page and again at checkout before they pay.
 *
 * Only rendered while the product type is "preorder" — the section is
 * meaningless for something already on a shelf — but the hidden field is always
 * submitted, so switching a product away from preorder clears the terms rather
 * than leaving stale ones behind a type that no longer shows them.
 */
export function PreorderTermsField({
  initial,
  visible,
}: {
  initial: PreorderTerms | null;
  visible: boolean;
}) {
  const [terms, setTerms] = useState<PreorderTerms>(initial ?? EMPTY_PREORDER_TERMS);

  const set = <K extends keyof PreorderTerms>(key: K, value: PreorderTerms[K]) =>
    setTerms((prev) => ({ ...prev, [key]: value }));

  const serialised = visible ? (serialisePreorderTerms(terms) ?? "") : "";

  return (
    <>
      <input type="hidden" name="preorderTerms" value={serialised} />

      {visible ? (
        <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-niki-orange" />
            <h2 className="font-display text-lg font-bold text-niki-ink">Preorder terms</h2>
          </div>
          <p className="mt-1 text-sm text-niki-ink/65">
            Shown on the product page and again at checkout, where the buyer has to accept them
            before paying. Leave a field blank to leave it out.
          </p>

          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estimated arrival" htmlFor="preorderArrival">
                <input
                  id="preorderArrival"
                  value={terms.estimatedArrival}
                  onChange={(e) => set("estimatedArrival", e.target.value)}
                  placeholder="Mid-March 2027"
                  className={inputClass}
                />
              </Field>
              <Field label="Preorder closes" htmlFor="preorderClosing">
                <input
                  id="preorderClosing"
                  value={terms.closingDate}
                  onChange={(e) => set("closingDate", e.target.value)}
                  placeholder="28 Feb 2027"
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Sourced from" htmlFor="preorderSource">
              <input
                id="preorderSource"
                value={terms.sourceLocation}
                onChange={(e) => set("sourceLocation", e.target.value)}
                placeholder="Guangzhou, China"
                className={inputClass}
              />
            </Field>

            <div className="rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge">
              <label className="flex items-center gap-2 text-sm font-medium text-niki-ink">
                <input
                  type="checkbox"
                  checked={terms.depositRequired}
                  onChange={(e) => set("depositRequired", e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                Take a deposit at checkout instead of the full price
              </label>

              {terms.depositRequired ? (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Deposit type" htmlFor="preorderDepositType">
                    <select
                      id="preorderDepositType"
                      value={terms.depositType}
                      onChange={(e) =>
                        set("depositType", e.target.value === "fixed_amount" ? "fixed_amount" : "percentage")
                      }
                      className={inputClass}
                    >
                      <option value="percentage">Percentage of the price</option>
                      <option value="fixed_amount">Fixed amount (GH₵)</option>
                    </select>
                  </Field>
                  <Field
                    label={terms.depositType === "percentage" ? "Deposit (%)" : "Deposit (GH₵)"}
                    htmlFor="preorderDepositValue"
                    hint="A deposit of zero is treated as no deposit."
                  >
                    <input
                      id="preorderDepositValue"
                      type="number"
                      min={0}
                      step="0.01"
                      value={terms.depositValue || ""}
                      onChange={(e) => set("depositValue", Number(e.target.value) || 0)}
                      className={inputClass}
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            <Field
              label="How the balance is paid"
              htmlFor="preorderBalance"
              hint="Only shown when you take a deposit."
            >
              <textarea
                id="preorderBalance"
                rows={2}
                value={terms.balanceInstruction}
                onChange={(e) => set("balanceInstruction", e.target.value)}
                placeholder="Balance due when the item lands in Accra, before collection."
                className={inputClass}
              />
            </Field>

            <Field
              label="Refund policy"
              htmlFor="preorderRefund"
              hint="What happens if it is late, cancelled, or never arrives. This is the term buyers ask about most."
            >
              <textarea
                id="preorderRefund"
                rows={2}
                value={terms.refundPolicy}
                onChange={(e) => set("refundPolicy", e.target.value)}
                placeholder="Full refund if the item has not arrived by 30 April."
                className={inputClass}
              />
            </Field>

            <Field
              label="Minimum orders before shipping"
              htmlFor="preorderMinimum"
              hint="0 means the batch ships regardless of how many are ordered."
            >
              <input
                id="preorderMinimum"
                type="number"
                min={0}
                value={terms.minimumOrders || ""}
                onChange={(e) => set("minimumOrders", Number(e.target.value) || 0)}
                className={inputClass}
              />
            </Field>
          </div>
        </section>
      ) : null}
    </>
  );
}
