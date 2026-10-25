"use client";

import { PackageX } from "lucide-react";
import { ActionForm } from "@/components/medical/console/ActionForm";
import {
  Field,
  FieldSet,
  NumberInput,
  Select,
  TextArea,
  TextInput,
} from "@/components/medical/console/Field";
import { saveProduct } from "@/lib/medical/admin/catalogue-actions";
import {
  PURCHASE_MODE_BLURBS,
  PURCHASE_MODE_LABELS,
  PURCHASE_MODES,
} from "@/lib/medical/purchase-mode";
import type { FormRow } from "@/lib/medical/admin/for-form";

/**
 * Everything about a product that a person maintains.
 *
 * Two fields are deliberately absent and both absences are load-bearing:
 *
 *  - **Stock.** `stockOnHand` moves only through the inventory module, inside a
 *    transaction that writes a movement in the same breath. A box here would be
 *    the one place that rule could be broken, and the counter and the log would
 *    then be able to disagree.
 *  - **Average cost.** Computed from the batches on every goods receipt. A
 *    typed figure would be overwritten by the next delivery, which is worse
 *    than not offering it.
 *
 * Costs that *are* here — the purchase cost — are what procurement maintains
 * between deliveries and what a new purchase order line starts from. The form
 * is only rendered for a role that may see cost.
 */
export function ProductForm({
  product,
  suppliers,
  showCost,
}: {
  product: FormRow & { id: string };
  suppliers: { id: string; name: string; currency: string }[];
  showCost: boolean;
}) {
  const str = (key: string) => String(product[key] ?? "");
  const num = (key: string) => String(product[key] ?? "0");
  const bool = (key: string) => (product[key] === true || product[key] === "true" ? "1" : "0");

  return (
    <ActionForm
      action={saveProduct}
      submitLabel="Save product"
      pendingLabel="Saving…"
      successMessage="Saved."
      className="medi-panel medi-panel-lg space-y-8 p-5 sm:p-6"
    >
      <input type="hidden" name="id" value={product.id} />

      <FieldSet legend="What it is" columns={2}>
        <Field label="Name" htmlFor="name" required className="sm:col-span-2">
          <TextInput id="name" required defaultValue={str("name")} />
        </Field>
        <Field
          label="Manufacturer catalogue number"
          htmlFor="catalogueNumber"
          hint="Searched before the name — a laboratory orders by this."
        >
          <TextInput id="catalogueNumber" defaultValue={str("catalogueNumber")} />
        </Field>
        <Field label="Pack size" htmlFor="packSize" hint="&ldquo;Pack of 100&rdquo;, &ldquo;500 mL bottle&rdquo;.">
          <TextInput id="packSize" defaultValue={str("packSize")} />
        </Field>
        <Field label="Unit of sale" htmlFor="unitOfSale" hint="The noun on a quotation line.">
          <TextInput id="unitOfSale" defaultValue={str("unitOfSale") || "unit"} />
        </Field>
        <Field
          label="Items per unit"
          htmlFor="unitsPerPack"
          hint="Zero where it makes no sense — a bottle has no count."
        >
          <NumberInput id="unitsPerPack" min="0" defaultValue={num("unitsPerPack")} />
        </Field>
        <Field label="One-line summary" htmlFor="summary" className="sm:col-span-2">
          <TextInput id="summary" defaultValue={str("summary")} />
        </Field>
        <Field label="Description" htmlFor="description" className="sm:col-span-2">
          <TextArea id="description" rows={4} defaultValue={str("description")} />
        </Field>
      </FieldSet>

      <FieldSet legend="Price and how it may be bought" columns={3}>
        <Field label="Listed price (GH₵)" htmlFor="price" required>
          <NumberInput id="price" step="0.01" min="0" required defaultValue={money(product.price)} />
        </Field>
        <Field
          label="Was (GH₵)"
          htmlFor="comparePrice"
          hint="Struck through beside the price. Blank for none."
        >
          <NumberInput
            id="comparePrice"
            step="0.01"
            min="0"
            defaultValue={product.comparePrice ? money(product.comparePrice) : ""}
          />
        </Field>
        <Field label="Minimum order" htmlFor="minimumOrderQuantity">
          <NumberInput id="minimumOrderQuantity" min="1" defaultValue={num("minimumOrderQuantity")} />
        </Field>
        <Field
          label="How it may be bought"
          htmlFor="purchaseMode"
          required
          hint={PURCHASE_MODE_BLURBS[(str("purchaseMode") || "BOTH") as keyof typeof PURCHASE_MODE_BLURBS]}
          className="sm:col-span-2"
        >
          <Select id="purchaseMode" defaultValue={str("purchaseMode") || "BOTH"}>
            {PURCHASE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {PURCHASE_MODE_LABELS[mode]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="status" required>
          <Select id="status" defaultValue={str("status") || "DRAFT"}>
            <option value="DRAFT">Draft — not on the storefront</option>
            <option value="ACTIVE">Active</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
            <option value="DISCONTINUED">Discontinued</option>
            <option value="ARCHIVED">Archived — hidden, references kept</option>
          </Select>
        </Field>
      </FieldSet>

      {showCost ? (
        <FieldSet
          legend="Cost and sourcing"
          description="Internal. None of this is selected by any storefront query."
          columns={3}
        >
          <Field
            label="Purchase cost (GH₵)"
            htmlFor="purchaseCost"
            hint="What we pay for one unit of sale. The default on a new purchase order line."
          >
            <NumberInput
              id="purchaseCost"
              step="0.01"
              min="0"
              defaultValue={money(product.purchaseCost)}
            />
          </Field>
          <Field label="Usual supplier" htmlFor="primarySupplierId">
            <Select id="primarySupplierId" defaultValue={str("primarySupplierId")}>
              <option value="">None chosen</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} · {supplier.currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sourced" htmlFor="sourcingMode">
            <Select id="sourcingMode" defaultValue={str("sourcingMode") || "LOCAL"}>
              <option value="LOCAL">Locally</option>
              <option value="IMPORT">Imported</option>
              <option value="BOTH">Either</option>
            </Select>
          </Field>
          <Field
            label="Internal notes"
            htmlFor="internalNotes"
            hint="What the buyer needs and no customer should see."
            className="sm:col-span-2 lg:col-span-3"
          >
            <TextArea id="internalNotes" rows={3} defaultValue={str("internalNotes")} />
          </Field>
        </FieldSet>
      ) : null}

      <FieldSet
        legend="Stock policy"
        description="What to hold and when to reorder. The stock figure itself is not editable here — it moves only through a recorded stock movement, so the counter and the log cannot disagree."
        columns={3}
      >
        <Field label="Reorder at" htmlFor="reorderLevel" hint="Free stock at or below this is flagged.">
          <NumberInput id="reorderLevel" min="0" defaultValue={num("reorderLevel")} />
        </Field>
        <Field label="Reorder quantity" htmlFor="reorderQuantity">
          <NumberInput id="reorderQuantity" min="0" defaultValue={num("reorderQuantity")} />
        </Field>
        <Field label="Tracked by batch and expiry" htmlFor="tracksBatches">
          <Select id="tracksBatches" defaultValue={bool("tracksBatches")}>
            <option value="0">No</option>
            <option value="1">Yes</option>
          </Select>
        </Field>
        <Field
          label="Orders beyond stock"
          htmlFor="allowBackorder"
          hint="For a line always brought in to order."
        >
          <Select id="allowBackorder" defaultValue={bool("allowBackorder")}>
            <option value="0">Not allowed</option>
            <option value="1">Allowed</option>
          </Select>
        </Field>
        <Field label="Lead time, shortest (days)" htmlFor="leadTimeMinDays">
          <NumberInput id="leadTimeMinDays" min="0" defaultValue={num("leadTimeMinDays")} />
        </Field>
        <Field label="Lead time, longest (days)" htmlFor="leadTimeMaxDays">
          <NumberInput id="leadTimeMaxDays" min="0" defaultValue={num("leadTimeMaxDays")} />
        </Field>
      </FieldSet>

      <FieldSet legend="Handling and restrictions" columns={3}>
        <Field label="Storage" htmlFor="storageCondition">
          <Select id="storageCondition" defaultValue={str("storageCondition") || "AMBIENT"}>
            <option value="AMBIENT">Ambient</option>
            <option value="COOL">Cool</option>
            <option value="REFRIGERATED">Refrigerated</option>
            <option value="FROZEN">Frozen</option>
            <option value="CONTROLLED">Controlled</option>
          </Select>
        </Field>
        <Field
          label="Needs a cold chain"
          htmlFor="requiresColdChain"
          hint="Shown before a customer orders."
        >
          <Select id="requiresColdChain" defaultValue={bool("requiresColdChain")}>
            <option value="0">No</option>
            <option value="1">Yes</option>
          </Select>
        </Field>
        <Field label="Hazard class" htmlFor="hazardClass" hint="Blank when not applicable.">
          <TextInput id="hazardClass" defaultValue={str("hazardClass")} />
        </Field>
        <Field
          label="Handling notes"
          htmlFor="handlingNotes"
          hint="Printed on the delivery note."
          className="sm:col-span-2 lg:col-span-3"
        >
          <TextInput id="handlingNotes" defaultValue={str("handlingNotes")} />
        </Field>
        <Field
          label="Restricted sale"
          htmlFor="restrictedSale"
          hint="A licence or institutional account must be checked."
        >
          <Select id="restrictedSale" defaultValue={bool("restrictedSale")}>
            <option value="0">No</option>
            <option value="1">Yes</option>
          </Select>
        </Field>
        <Field
          label="What must be shown"
          htmlFor="restrictionNote"
          hint="Required when restricted. A restriction nobody can act on is not one."
          className="sm:col-span-2"
        >
          <TextInput id="restrictionNote" defaultValue={str("restrictionNote")} />
        </Field>
      </FieldSet>

      <FieldSet
        legend="Findability"
        description="Never displayed. Appended to what search looks at."
        columns={1}
      >
        <Field
          label="Extra search terms"
          htmlFor="searchTerms"
          hint="Trade names, common misspellings, the local word for it."
        >
          <TextInput id="searchTerms" defaultValue={str("searchTerms")} />
        </Field>
      </FieldSet>

      <p className="medi-meta flex items-start gap-2 rounded-xl bg-medi-surface px-3.5 py-3 text-medi-muted">
        <PackageX className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          There is no delete. A product that has been quoted or sold is referenced by documents that
          must keep rendering, so the end of its life is <strong>Archived</strong>: hidden from the
          storefront, every reference intact.
        </span>
      </p>
    </ActionForm>
  );
}

/** A decimal string from the row, as a form value. Blank reads as zero. */
function money(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}
