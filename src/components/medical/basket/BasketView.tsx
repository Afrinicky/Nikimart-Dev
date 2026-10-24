"use client";

import { ArrowRight, FileText, ShoppingCart, Trash2 } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { MedicalButton, MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { useBasket, type BasketList } from "@/components/medical/providers/BasketProvider";
import { formatPesewas, sum } from "@/lib/medical/money";

/**
 * The cart and the quotation list are the same screen.
 *
 * They hold the same shape of thing and support the same four actions —
 * change a quantity, remove a line, move it to the other list, go on to the
 * next step. Two components would be two places to fix the same bug, and the
 * second one would start drifting the first time somebody touched only one.
 *
 * What differs is the end of it: a cart totals up and goes to checkout; a
 * quotation list does not total at all, because the point of asking for a
 * quotation is that the price is not settled yet. A confident total on a
 * quotation list would promise a figure this business has not agreed to.
 */
export function BasketView({ list }: { list: BasketList }) {
  const basket = useBasket();
  const lines = basket[list];
  const isCart = list === "cart";

  // The basket lives in localStorage, which the server cannot see. A skeleton
  // of the right shape beats rendering "empty" for a moment and then filling
  // in — that reads as items having been lost and then found.
  if (!basket.ready) {
    return (
      <div className="mt-8 space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="medi-skeleton h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="medi-panel medi-panel-lg mt-8 px-6 py-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-medi-mint-50 text-medi-teal-600">
          {isCart ? (
            <ShoppingCart className="h-5 w-5" aria-hidden />
          ) : (
            <FileText className="h-5 w-5" aria-hidden />
          )}
        </span>
        <h2 className="medi-h3 mt-4">
          {isCart ? "Your cart is empty" : "Your quotation list is empty"}
        </h2>
        <p className="medi-prose mx-auto mt-2 text-[0.875rem] text-medi-body">
          {isCart
            ? "Things you can buy outright go here. Add them from the catalogue and check out when you are ready."
            : "Add everything you need a price for — as many lines as you like — and send it as one request. You do not need an account to ask."}
        </p>
        <MedicalButtonLink href="/medicals/categories" className="mt-6">
          Browse the catalogue
        </MedicalButtonLink>
      </div>
    );
  }

  const total = sum(lines.map((line) => line.price * line.quantity));
  const anyUnpriced = lines.some((line) => line.price <= 0);

  return (
    <div className="mt-8 lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-8">
      <ul className="space-y-3">
        {lines.map((line) => (
          <li key={line.productId} className="medi-panel flex gap-4 p-4">
            {/* The thumbnail is decorative: the product name beside it is
                already a link to the same place, and a second link to one
                destination is one more stop on the way through by keyboard. */}
            <span className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-medi-surface">
              {line.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- see ProductCard.
                <img src={line.image} alt="" className="h-full w-full object-contain p-2" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-medi-mint-50 text-[0.875rem] font-bold text-medi-teal-700">
                  {line.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </span>

            <div className="min-w-0 flex-1">
              <h2 className="text-[0.9375rem] font-semibold leading-snug">
                <MedicalLink
                  href={`/medicals/products/${line.slug}`}
                  className="medi-focus rounded text-medi-ink transition-colors hover:text-medi-teal-700"
                >
                  {line.name}
                </MedicalLink>
              </h2>
              {line.packSize ? (
                <p className="medi-meta mt-0.5 text-medi-muted">{line.packSize}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-2">
                  <span className="medi-meta text-medi-muted">Qty</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={line.minimumOrderQuantity}
                    value={line.quantity}
                    aria-label={`Quantity of ${line.name}`}
                    onChange={(event) =>
                      basket.setQuantity(list, line.productId, Number(event.target.value))
                    }
                    className="font-figures medi-focus h-9 w-16 rounded-lg bg-white text-center text-[0.875rem] font-semibold text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => basket.moveTo(list, line.productId)}
                  className="medi-focus medi-meta rounded font-semibold text-medi-teal-700 underline-offset-4 hover:underline"
                >
                  {isCart ? "Move to quotation list" : "Move to cart"}
                </button>

                <button
                  type="button"
                  onClick={() => basket.remove(list, line.productId)}
                  aria-label={`Remove ${line.name}`}
                  className="medi-focus medi-meta ml-auto flex items-center gap-1.5 rounded text-medi-muted transition-colors hover:text-medi-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Remove
                </button>
              </div>
            </div>

            {isCart ? (
              <div className="shrink-0 text-right">
                <p className="font-figures text-[0.9375rem] font-bold text-medi-ink">
                  {line.price > 0 ? formatPesewas(line.price * line.quantity) : "On request"}
                </p>
                {line.price > 0 && line.quantity > 1 ? (
                  <p className="font-figures medi-meta mt-1 text-medi-muted">
                    {formatPesewas(line.price)} each
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <aside className="medi-panel medi-panel-lg mt-6 p-6 lg:sticky lg:top-[9.5rem] lg:mt-0">
        <h2 className="medi-h3">{isCart ? "Order summary" : "Your request"}</h2>

        {isCart ? (
          <>
            <dl className="mt-4 space-y-2.5">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[0.875rem] text-medi-body">
                  Subtotal ({lines.length} {lines.length === 1 ? "line" : "lines"})
                </dt>
                <dd className="font-figures text-[0.9375rem] font-bold text-medi-ink">
                  {formatPesewas(total)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[0.875rem] text-medi-body">Delivery</dt>
                {/* Not estimated here. A figure invented before the address is
                    known is a figure that changes at checkout, which is the
                    most common reason a cart is abandoned at the last step. */}
                <dd className="text-[0.875rem] font-medium text-medi-muted">
                  Calculated at checkout
                </dd>
              </div>
            </dl>

            {anyUnpriced ? (
              <p className="medi-meta mt-4 rounded-xl bg-medi-warning-soft px-3.5 py-3 text-medi-warning">
                One of these is priced on request. Move it to your quotation list
                to have it priced.
              </p>
            ) : null}

            <MedicalButtonLink href="/medicals/checkout" size="lg" className="mt-5 w-full">
              Checkout
              <ArrowRight className="h-4 w-4" aria-hidden />
            </MedicalButtonLink>
            <p className="medi-meta mt-3 text-medi-muted">
              Prices and stock are confirmed on the server before anything is charged.
            </p>
          </>
        ) : (
          <>
            <p className="medi-prose mt-3 text-[0.875rem] text-medi-body">
              {lines.length} {lines.length === 1 ? "line" : "lines"}. Send it as one
              request and we will come back with prices, lead times and terms.
            </p>
            <MedicalButtonLink href="/medicals/quotations/new" size="lg" className="mt-5 w-full">
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden />
            </MedicalButtonLink>
            <p className="medi-meta mt-3 text-medi-muted">
              No account needed, and nothing is charged for asking.
            </p>
          </>
        )}

        <MedicalButton
          variant="quiet"
          onClick={() => basket.clear(list)}
          className="mt-4 w-full text-[0.8125rem]"
        >
          Clear {isCart ? "cart" : "list"}
        </MedicalButton>
      </aside>
    </div>
  );
}
