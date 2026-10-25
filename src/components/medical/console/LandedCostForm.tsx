"use client";

import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, NumberInput, Select } from "@/components/medical/console/Field";
import { savePurchaseOrderCosts } from "@/lib/medical/procurement/actions";

/**
 * Freight, duty, clearing — estimated, then confirmed.
 *
 * Two columns on purpose. The estimate is entered when the order is placed and
 * the actual arrives with the clearing agent's invoice months later, and the
 * difference between them is the difference between a planned margin and a
 * real one. Overwriting the estimate with the actual would lose the only
 * figure that shows whether the buying was costed well.
 *
 * Reports use the actual where it exists and the estimate until then, and say
 * which — a report that mixes the two silently is one nobody can act on.
 */
export function LandedCostForm({
  order,
}: {
  /**
   * Plain strings, not the Prisma row.
   *
   * Decimal columns arrive as Decimal instances, and a Decimal cannot cross
   * into a client component: React refuses to serialise it, warns on every
   * field, and what reaches the browser is an object the form cannot read.
   * The page converts before it hands them over.
   */
  order: {
    id: string;
    currency: string;
    exchangeRate: string;
    shippingEstimate: string;
    shippingActual: string;
    dutyEstimate: string;
    dutyActual: string;
    clearingEstimate: string;
    clearingActual: string;
    otherEstimate: string;
    otherActual: string;
    costsConfirmed: boolean;
  };
}) {
  const rows = [
    { key: "shipping", label: "Shipping and freight" },
    { key: "duty", label: "Import duty" },
    { key: "clearing", label: "Clearing and handling" },
    { key: "other", label: "Other charges" },
  ] as const;

  const value = (key: keyof typeof order) => order[key] as string;

  return (
    <ActionForm
      action={savePurchaseOrderCosts}
      submitLabel="Save landed costs"
      successMessage="Costs saved and apportioned across the line items."
      className="medi-panel medi-panel-lg p-5 sm:p-6"
    >
      <input type="hidden" name="purchaseOrderId" value={order.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Exchange rate"
          htmlFor="exchangeRate"
          hint={`GH₵ per 1 ${order.currency}. Locked to this order, not looked up later.`}
        >
          <NumberInput id="exchangeRate" defaultValue={order.exchangeRate} />
        </Field>
        <Field
          label="Cost status"
          htmlFor="costsConfirmed"
          hint="Until these are confirmed, every report labels this order's cost as estimated."
        >
          <Select id="costsConfirmed" defaultValue={order.costsConfirmed ? "1" : "0"}>
            <option value="0">Estimated</option>
            <option value="1">Confirmed</option>
          </Select>
        </Field>
      </div>

      <table className="mt-6 w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="bg-medi-mint-50">
            <th className="rounded-l-xl px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
              Charge
            </th>
            <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
              Estimated (GH₵)
            </th>
            <th className="rounded-r-xl px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
              Actual (GH₵)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-medi-rule">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-3 text-[0.8125rem] font-medium text-medi-ink">{row.label}</td>
              <td className="px-3 py-3 text-right">
                <label className="sr-only" htmlFor={`${row.key}Estimate`}>
                  {row.label} estimate
                </label>
                <NumberInput
                  id={`${row.key}Estimate`}
                  defaultValue={value(`${row.key}Estimate` as keyof typeof order)}
                  className="w-32"
                />
              </td>
              <td className="px-3 py-3 text-right">
                <label className="sr-only" htmlFor={`${row.key}Actual`}>
                  {row.label} actual
                </label>
                <NumberInput
                  id={`${row.key}Actual`}
                  defaultValue={value(`${row.key}Actual` as keyof typeof order)}
                  className="w-32"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="medi-meta mt-4 text-medi-muted">
        Charges are apportioned across the line items by value, so a GH₵12 swab does not carry the
        same freight as a GH₵32,500 analyser. The apportioned parts add back to exactly what was
        paid.
      </p>
    </ActionForm>
  );
}
