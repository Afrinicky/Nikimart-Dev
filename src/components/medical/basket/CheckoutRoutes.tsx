"use client";

import { useRouter } from "next/navigation";
import { FileText, Loader2, Phone } from "lucide-react";
import { useState } from "react";
import { MedicalButton, MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { useBasket } from "@/components/medical/providers/BasketProvider";
import { formatPesewas } from "@/lib/medical/money";

/**
 * What a cart can do here today.
 *
 * Paying by card or mobile money is not wired up on the medical side yet, and
 * a page that pretended otherwise would take somebody's time and then fail
 * them at the last step. So this says what it is, and offers the two routes
 * that do work end to end: turn the cart into a priced quotation request, or
 * ring us and read the list out.
 *
 * Moving the lines across rather than starting again is the whole point —
 * somebody who has spent ten minutes building a cart should not have to
 * rebuild it as a quotation list.
 */
export function CheckoutRoutes({ phone }: { phone: string }) {
  const basket = useBasket();
  const router = useRouter();
  const [moving, setMoving] = useState(false);

  const total = basket.cart.reduce((sum, line) => sum + line.price * line.quantity, 0);

  function sendAsRequest() {
    setMoving(true);
    for (const line of [...basket.cart]) basket.moveTo("cart", line.productId);
    router.push("/medicals/quotations/new");
  }

  if (basket.ready && basket.cart.length === 0) {
    return (
      <div className="medi-panel p-6">
        <p className="medi-prose text-medi-body">
          Your cart is empty. Add something from the catalogue, or ask for a price
          on anything you cannot find.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <MedicalButtonLink href="/medicals/categories">Browse the catalogue</MedicalButtonLink>
          <MedicalButtonLink href="/medicals/quotations/new" variant="secondary">
            Request a quotation
          </MedicalButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="medi-panel p-5">
        <h2 className="medi-h3 text-medi-ink">In your cart</h2>
        <ul className="mt-3 divide-y divide-medi-rule">
          {basket.cart.map((line) => (
            <li key={line.productId} className="flex items-baseline gap-3 py-2.5">
              <span className="min-w-0 flex-1 text-sm text-medi-ink">{line.name}</span>
              <span className="font-figures medi-meta text-medi-muted">
                {line.quantity} × {formatPesewas(line.price)}
              </span>
              <span className="font-figures w-24 text-right text-sm font-semibold text-medi-ink">
                {formatPesewas(line.price * line.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-baseline justify-between border-t border-medi-rule pt-3">
          <span className="text-sm font-semibold text-medi-ink">Listed total</span>
          <span className="font-figures text-sm font-bold text-medi-ink">
            {formatPesewas(total)}
          </span>
        </p>
        <p className="medi-meta mt-2 text-medi-muted">
          Listed prices, before delivery and any tax. A quotation prices it for the
          quantity you are asking for.
        </p>
      </div>

      <div className="medi-panel p-5">
        <h2 className="medi-h3 text-medi-ink">Turn it into a quotation</h2>
        <p className="medi-prose mt-2 text-[0.875rem] text-medi-body">
          We price it, confirm what is in stock, and send you a document your
          finance office can act on. Your lines come across as they are.
        </p>
        <MedicalButton onClick={sendAsRequest} disabled={moving} size="lg" className="mt-4">
          {moving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <FileText className="h-4 w-4" aria-hidden />
          )}
          Send these for a quotation
        </MedicalButton>
      </div>

      <div className="medi-panel p-5">
        <h2 className="medi-h3 text-medi-ink">Or order by telephone</h2>
        <p className="medi-prose mt-2 text-[0.875rem] text-medi-body">
          Read the list out and we will take it from there.
        </p>
        <a
          href={`tel:${phone.replace(/\s/g, "")}`}
          className="medi-focus medi-press mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] hover:text-medi-teal-700"
        >
          <Phone className="h-4 w-4" aria-hidden />
          {phone}
        </a>
      </div>
    </div>
  );
}
