"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { MedicalButton } from "@/components/medical/ui/MedicalButton";
import { FormField, SelectBox, TextAreaBox, TextBox } from "@/components/medical/ui/FormField";
import { useBasket } from "@/components/medical/providers/BasketProvider";
import { submitQuotationRequest } from "@/lib/medical/quotations/request-actions";
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS, needsInstitution, type CustomerType } from "@/lib/medical/customer-type";
import { formatPesewas } from "@/lib/medical/money";
import { cn } from "@/lib/cn";

/**
 * Asking for a price.
 *
 * The lines come from the quotation list the visitor has been building as
 * they browsed, and they can be changed here — quantities are usually decided
 * at this moment rather than at the moment something was added. Lines they
 * type themselves sit in the same list as the ones from the catalogue, because
 * a real request is nearly always a mix: four consumables we stock and one
 * analyser they could not find.
 *
 * No account is required, and the form does not ask for one. A request lost
 * at a registration gate is a sale lost at a registration gate.
 *
 * Validation is the same function the server runs — `validateRequest` — so a
 * field cannot pass here and fail there, and the server still decides.
 */

interface Line {
  key: string;
  productId: string | null;
  description: string;
  catalogueNumber: string;
  unit: string;
  quantity: number;
  /** Display only; the price on a request is never what anybody is charged. */
  price: number | null;
}

export interface RequestDefaults {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  institutionName: string;
  institutionType: string;
}

let counter = 0;
const nextKey = () => `line-${++counter}`;

export function RequestForm({ defaults }: { defaults: RequestDefaults }) {
  const basket = useBasket();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [lines, setLines] = useState<Line[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [form, setForm] = useState({
    contactName: defaults.contactName,
    contactEmail: defaults.contactEmail,
    contactPhone: defaults.contactPhone,
    institutionName: defaults.institutionName,
    institutionType: defaults.institutionType,
    deliverTo: "",
    requiredBy: "",
    notes: "",
    specialRequest: "",
  });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // The quotation list lives in the browser, so it arrives a tick after the
  // first render. This is an adjustment to state when an input changes, not a
  // side effect: React's guidance is to do it *during* render, and an effect
  // here costs an extra render pass every time — which is exactly the
  // cascading-render the linter flags.
  //
  // Seeded once. Re-running it would undo an edit whenever the basket changed
  // underneath, including the change this form makes to it on submit.
  if (basket.ready && !seeded) {
    setSeeded(true);
    setLines(
      basket.quote.map((line) => ({
        key: nextKey(),
        productId: line.productId,
        description: line.name,
        catalogueNumber: "",
        unit: line.unitOfSale,
        quantity: line.quantity,
        price: line.price,
      })),
    );
  }

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  function addLine() {
    setLines((current) => [
      ...current,
      {
        key: nextKey(),
        productId: null,
        description: "",
        catalogueNumber: "",
        unit: "unit",
        quantity: 1,
        price: null,
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    start(async () => {
      const result = await submitQuotationRequest({
        ...form,
        lines: lines.map((line) => ({
          productId: line.productId ?? undefined,
          description: line.description,
          catalogueNumber: line.catalogueNumber,
          quantity: line.quantity,
          unit: line.unit,
        })),
      });

      if (!result.ok) {
        setError({ message: result.error, field: result.field });
        return;
      }

      // The list has become a request; leaving it in the header would invite
      // sending the same one twice.
      basket.clear("quote");
      router.push(`/medicals/quotations/${result.token}?sent=1`);
    });
  }

  const institutionAsked = needsInstitution((form.institutionType || "OTHER") as CustomerType);

  return (
    <form onSubmit={submit} noValidate className="mt-8 space-y-10">
      <section aria-labelledby="request-items">
        <h2 id="request-items" className="medi-h3 text-medi-ink">
          What you need priced
        </h2>
        <p className="medi-prose mt-1.5 text-[0.875rem] text-medi-body">
          Everything from your quotation list is here. Change a quantity, remove a
          line, or add something that is not in the catalogue.
        </p>

        <div className="medi-panel mt-4 overflow-hidden">
          {lines.length === 0 ? (
            <p className="px-4 py-6 text-[0.9375rem] text-medi-body">
              No lines yet. Add one here, or describe what you need further down.
            </p>
          ) : (
            <ul className="divide-y divide-medi-rule">
              {lines.map((line, index) => (
                <li key={line.key} className="p-4">
                  <div className="flex flex-wrap items-end gap-3 sm:flex-nowrap">
                    <FormField
                      label={`Line ${index + 1}`}
                      htmlFor={`${line.key}-description`}
                      className="min-w-[14rem] flex-1"
                    >
                      <TextBox
                        id={`${line.key}-description`}
                        value={line.description}
                        readOnly={Boolean(line.productId)}
                        placeholder="What is it? Make and model help."
                        onChange={(event) =>
                          updateLine(line.key, { description: event.target.value })
                        }
                        className={cn(line.productId && "bg-medi-surface")}
                      />
                    </FormField>

                    <FormField
                      label="Quantity"
                      htmlFor={`${line.key}-quantity`}
                      className="w-28 shrink-0"
                    >
                      <TextBox
                        id={`${line.key}-quantity`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={line.quantity}
                        onChange={(event) =>
                          updateLine(line.key, {
                            quantity: Math.max(1, Math.trunc(Number(event.target.value) || 1)),
                          })
                        }
                        className="font-figures"
                      />
                    </FormField>

                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      aria-label={`Remove ${line.description || `line ${index + 1}`}`}
                      className="medi-focus medi-press mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-medi-muted hover:bg-medi-danger-soft hover:text-medi-danger"
                    >
                      <Trash2 className="h-[1.125rem] w-[1.125rem]" aria-hidden />
                    </button>
                  </div>

                  {line.price ? (
                    <p className="medi-meta mt-2 text-medi-muted">
                      Listed at {formatPesewas(line.price)} per {line.unit}. Your quotation
                      is priced for the quantity you are asking for.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-medi-rule p-3">
            <button
              type="button"
              onClick={addLine}
              className="medi-focus medi-press inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-medi-teal-700 hover:bg-medi-mint-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add a line
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="request-you">
        <h2 id="request-you" className="medi-h3 text-medi-ink">
          Who we are replying to
        </h2>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <FormField label="Your name" htmlFor="contactName" required>
            <TextBox
              id="contactName"
              autoComplete="name"
              value={form.contactName}
              onChange={(event) => set("contactName")(event.target.value)}
            />
          </FormField>

          <FormField
            label="Kind of organisation"
            htmlFor="institutionType"
            hint="So the right person prices it."
          >
            <SelectBox
              id="institutionType"
              value={form.institutionType}
              onChange={(event) => set("institutionType")(event.target.value)}
            >
              <option value="">Please choose</option>
              {CUSTOMER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CUSTOMER_TYPE_LABELS[type]}
                </option>
              ))}
            </SelectBox>
          </FormField>

          <FormField label="Email" htmlFor="contactEmail" hint="Either this or a telephone number.">
            <TextBox
              id="contactEmail"
              type="email"
              autoComplete="email"
              value={form.contactEmail}
              onChange={(event) => set("contactEmail")(event.target.value)}
            />
          </FormField>

          <FormField label="Telephone" htmlFor="contactPhone">
            <TextBox
              id="contactPhone"
              type="tel"
              autoComplete="tel"
              value={form.contactPhone}
              onChange={(event) => set("contactPhone")(event.target.value)}
            />
          </FormField>

          {institutionAsked ? (
            <FormField
              label="Institution"
              htmlFor="institutionName"
              className="sm:col-span-2"
              hint="The name that should appear on the quotation."
            >
              <TextBox
                id="institutionName"
                autoComplete="organization"
                value={form.institutionName}
                onChange={(event) => set("institutionName")(event.target.value)}
              />
            </FormField>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="request-detail">
        <h2 id="request-detail" className="medi-h3 text-medi-ink">
          Anything else
        </h2>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <FormField label="Deliver to" htmlFor="deliverTo" hint="Town or facility.">
            <TextBox
              id="deliverTo"
              value={form.deliverTo}
              onChange={(event) => set("deliverTo")(event.target.value)}
            />
          </FormField>

          <FormField
            label="Needed by"
            htmlFor="requiredBy"
            hint="Not a promise — it tells us how to source it."
          >
            <TextBox
              id="requiredBy"
              type="date"
              value={form.requiredBy}
              onChange={(event) => set("requiredBy")(event.target.value)}
              className="font-figures"
            />
          </FormField>

          <FormField
            label="Something not in the catalogue"
            htmlFor="specialRequest"
            className="sm:col-span-2"
            hint="Describe it and we will tell you whether we can source it."
          >
            <TextAreaBox
              id="specialRequest"
              value={form.specialRequest}
              onChange={(event) => set("specialRequest")(event.target.value)}
            />
          </FormField>

          <FormField label="Notes" htmlFor="notes" className="sm:col-span-2">
            <TextAreaBox
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(event) => set("notes")(event.target.value)}
            />
          </FormField>
        </div>
      </section>

      {error ? (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="medi-focus rounded-lg bg-medi-danger-soft px-4 py-3 text-[0.9375rem] font-medium text-medi-danger"
        >
          {error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <MedicalButton type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Send the request
        </MedicalButton>
        <p className="medi-meta text-medi-muted">
          We reply with a priced quotation. Nothing is ordered by sending this.
        </p>
      </div>
    </form>
  );
}
