"use client";

import { useState } from "react";
import { Check, FileText, Minus, Plus, ShoppingCart } from "lucide-react";
import { MedicalButton, MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { AvailabilityBadge } from "@/components/medical/product/AvailabilityBadge";
import { useBasket } from "@/components/medical/providers/BasketProvider";
import { formatPesewas } from "@/lib/medical/money";
import { formatLeadTime, purchaseNote, purchaseOptions } from "@/lib/medical/purchase-mode";
import type { ProductSummary } from "@/lib/medical/catalogue";

/**
 * Price, quantity and the buttons, on the product page.
 *
 * The three questions a buyer came with, answered together and in order: what
 * does it cost, can I have it, how long will it take. Splitting those across
 * the page — price at the top, stock in a table, lead time in a tab — is what
 * makes somebody ring to ask a question the page already answered.
 *
 * Which buttons appear is `purchaseOptions`, the same pure function the card
 * and the server action use, so the page cannot offer something the server
 * will refuse.
 */
export function ProductPurchasePanel({ product }: { product: ProductSummary }) {
  const basket = useBasket();
  const options = purchaseOptions(product);
  const [quantity, setQuantity] = useState(product.minimumOrderQuantity);
  const [added, setAdded] = useState<"cart" | "quote" | null>(null);

  const note = purchaseNote(options, product.availability, product.price);

  function add(list: "cart" | "quote") {
    basket.add(
      list,
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        price: product.price,
        unitOfSale: product.unitOfSale,
        packSize: product.packSize,
        image: product.image?.url ?? null,
        minimumOrderQuantity: product.minimumOrderQuantity,
      },
      quantity,
    );
    setAdded(list);
    window.setTimeout(() => setAdded(null), 2600);
  }

  return (
    <div className="medi-panel medi-panel-lg p-6">
      {/* Wraps, because the price and the badge do not both fit on a 320px
          screen once the price runs to five figures — "GH₵32,500.00 per unit"
          pushed the badge 17px past the edge and put a horizontal scrollbar on
          the page. The badge drops below the price instead of being squeezed. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {product.price > 0 ? (
            <p className="font-figures text-[1.75rem] font-bold leading-none text-medi-ink">
              {formatPesewas(product.price)}
              <span className="ml-1.5 text-[0.875rem] font-medium text-medi-muted">
                per {product.unitOfSale}
              </span>
            </p>
          ) : (
            <p className="text-[1.25rem] font-bold text-medi-ink">Priced on request</p>
          )}
          {product.comparePrice ? (
            <p className="font-figures mt-1.5 text-[0.875rem] text-medi-muted">
              <span className="line-through">{formatPesewas(product.comparePrice)}</span>{" "}
              <span className="font-semibold text-medi-success">
                Save {formatPesewas(product.comparePrice - product.price)}
              </span>
            </p>
          ) : null}
        </div>
        <AvailabilityBadge availability={product.availability} className="shrink-0 pb-1.5" />
      </div>

      <dl className="mt-5 space-y-2.5 border-t border-medi-rule pt-5">
        {product.packSize ? <Row label="Pack size" value={product.packSize} /> : null}
        <Row label="Delivery" value={formatLeadTime(product.leadTime)} />
        {product.minimumOrderQuantity > 1 ? (
          <Row
            label="Minimum order"
            value={`${product.minimumOrderQuantity} ${product.unitOfSale}s`}
          />
        ) : null}
      </dl>

      {options.primary ? (
        <div className="mt-5 border-t border-medi-rule pt-5">
          <div className="flex items-center gap-3">
            <QuantityStepper
              value={quantity}
              min={product.minimumOrderQuantity}
              unit={product.unitOfSale}
              onChange={setQuantity}
            />
            <p className="font-figures text-[0.875rem] text-medi-muted">
              {product.price > 0 ? (
                <>
                  <span className="font-semibold text-medi-ink">
                    {formatPesewas(product.price * quantity)}
                  </span>{" "}
                  total
                </>
              ) : null}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            {options.canCheckout ? (
              <MedicalButton size="lg" onClick={() => add("cart")} className="w-full">
                {added === "cart" ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <ShoppingCart className="h-4 w-4" aria-hidden />
                )}
                {added === "cart" ? "Added to cart" : "Add to cart"}
              </MedicalButton>
            ) : null}

            {options.canQuote ? (
              <MedicalButton
                size="lg"
                variant={options.canCheckout ? "secondary" : "primary"}
                onClick={() => add("quote")}
                className="w-full"
              >
                {added === "quote" ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <FileText className="h-4 w-4" aria-hidden />
                )}
                {added === "quote" ? "Added to quotation list" : "Add to quotation list"}
              </MedicalButton>
            ) : null}
          </div>

          {added ? (
            <MedicalButtonLink
              href={added === "cart" ? "/medicals/cart" : "/medicals/quotation-list"}
              variant="quiet"
              className="mt-2 w-full"
            >
              {added === "cart" ? "Go to cart" : "Go to quotation list"}
            </MedicalButtonLink>
          ) : null}

          <span role="status" aria-live="polite" className="sr-only">
            {added === "cart"
              ? `${quantity} added to your cart`
              : added === "quote"
                ? `${quantity} added to your quotation list`
                : ""}
          </span>
        </div>
      ) : null}

      {note ? (
        <p className="medi-meta mt-4 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="medi-meta text-medi-muted">{label}</dt>
      <dd className="text-right text-[0.875rem] font-medium text-medi-ink">{value}</dd>
    </div>
  );
}

/**
 * A stepper rather than a bare number input.
 *
 * Quantities here are often in tens or hundreds, so the field is typeable —
 * but the buttons matter on a phone, where selecting the contents of a number
 * input to change a 1 to a 12 is genuinely fiddly. The minimum is enforced on
 * blur rather than on every keystroke, or typing "20" over a minimum of 5
 * would snap to 5 the moment the "2" landed.
 */
function QuantityStepper({
  value,
  min,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));

  function commit(raw: string) {
    const parsed = Math.floor(Number(raw));
    const next = Number.isFinite(parsed) && parsed >= min ? parsed : min;
    onChange(next);
    setText(String(next));
  }

  function step(delta: number) {
    const next = Math.max(min, value + delta);
    onChange(next);
    setText(String(next));
  }

  return (
    <div className="flex h-11 items-center rounded-xl bg-white shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)]">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className="medi-focus flex h-11 w-10 items-center justify-center rounded-l-xl text-medi-ink transition-colors hover:bg-medi-mint-50 disabled:text-medi-disabled disabled:hover:bg-transparent"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={text}
        min={min}
        aria-label={`Quantity in ${unit}s`}
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        className="font-figures medi-focus h-11 w-14 border-x border-medi-rule bg-transparent text-center text-[0.875rem] font-semibold text-medi-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Increase quantity"
        className="medi-focus flex h-11 w-10 items-center justify-center rounded-r-xl text-medi-ink transition-colors hover:bg-medi-mint-50"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
