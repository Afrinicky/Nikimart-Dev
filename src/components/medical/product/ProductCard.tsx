"use client";

import { useState } from "react";
import { Check, FileText, Plus, Snowflake } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { AvailabilityBadge } from "@/components/medical/product/AvailabilityBadge";
import { useBasket } from "@/components/medical/providers/BasketProvider";
import { formatPesewas } from "@/lib/medical/money";
import { purchaseOptions } from "@/lib/medical/purchase-mode";
import type { ProductSummary } from "@/lib/medical/catalogue";
import { cn } from "@/lib/cn";

/**
 * A product, as it appears in a grid or a rail.
 *
 * A card is used here because a product genuinely is one: a discrete thing
 * with a picture, a name and a price, which has to be comparable against the
 * one beside it. It is the only place in this system where a card is the
 * answer; everything else is a list, a table or a plain section.
 *
 * What the card says, in the order a buyer reads it:
 *
 *   the photograph — is this the thing I mean
 *   the catalogue number — is this *exactly* the thing I mean
 *   the name and pack size — what am I getting, and how much of it
 *   the price — per what
 *   stock — can I have it now
 *
 * Manufacturer and catalogue number sit above the name rather than below it
 * because a laboratory identifies a product by them, and a card that buries
 * the part number under two lines of marketing name is a card that makes a
 * professional squint.
 *
 * The whole card is a link; the add button is a button inside it. That is
 * ordinarily a nesting problem — the fix here is that the link covers the card
 * through a positioned overlay rather than wrapping it, so the button is a
 * sibling rather than a descendant and both are reachable by keyboard in the
 * order they appear.
 */
export function ProductCard({
  product,
  action,
  className,
}: {
  product: ProductSummary;
  /**
   * An optional control for this product, shown on the bottom row. The saved
   * list puts its remove button here. It sits above the card's link overlay,
   * like the add button, or the click would land on the link instead.
   */
  action?: React.ReactNode;
  className?: string;
}) {
  const basket = useBasket();
  const [justAdded, setJustAdded] = useState(false);
  const options = purchaseOptions(product);

  const list = options.primary === "CHECKOUT" ? "cart" : "quote";
  const inBasket = basket.ready && basket.has(list, product.id);

  function add() {
    if (!options.primary) return;
    basket.add(list, {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      unitOfSale: product.unitOfSale,
      packSize: product.packSize,
      image: product.image?.url ?? null,
      minimumOrderQuantity: product.minimumOrderQuantity,
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1600);
  }

  return (
    <article
      // No `h-full` here, deliberately. A flex item with `height: 100%` against
      // an auto-height container resolves to auto, which *disables* the
      // `align-items: stretch` that was making every card in a rail the same
      // height — so the class added to equalise them was the reason they were
      // ragged. Stretch does it on its own, in a rail and in a grid alike.
      className={cn(
        "medi-panel medi-raise group relative flex flex-col overflow-hidden",
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-medi-surface">
        {product.image ? (
          /* Product images are administrator-uploaded at unknown dimensions and
             may be data URLs; next/image would need a loader per source to add
             nothing here. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image.url}
            alt={product.image.alt || product.name}
            loading="lazy"
            className="h-full w-full object-contain p-5 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
          />
        ) : (
          <ImagePlaceholder name={product.name} />
        )}

        {product.requiresColdChain ? (
          <span
            className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-medi-info-soft px-2 py-1 text-[0.6875rem] font-semibold text-medi-info"
            title="Shipped under cold chain"
          >
            <Snowflake className="h-3 w-3" aria-hidden />
            Cold chain
          </span>
        ) : null}

        {product.isNewArrival ? (
          <span className="absolute right-3 top-3 rounded-md bg-medi-ink px-2 py-1 text-[0.6875rem] font-semibold text-white">
            New
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="medi-meta flex min-h-[1.125rem] items-center gap-1.5 text-medi-muted">
          {product.manufacturerName ? (
            <span className="truncate">{product.manufacturerName}</span>
          ) : null}
          {product.manufacturerName && product.catalogueNumber ? (
            <span aria-hidden className="text-medi-rule-strong">·</span>
          ) : null}
          {product.catalogueNumber ? (
            <span className="font-figures truncate">{product.catalogueNumber}</span>
          ) : null}
        </p>

        <h3 className="mt-1 text-[0.9375rem] font-semibold leading-snug text-medi-ink">
          <MedicalLink
            href={`/medicals/products/${product.slug}`}
            className="medi-focus rounded before:absolute before:inset-0 before:content-['']"
          >
            <span className="line-clamp-2 transition-colors group-hover:text-medi-teal-700">
              {product.name}
            </span>
          </MedicalLink>
        </h3>

        {product.packSize ? (
          <p className="medi-meta mt-1 text-medi-muted">{product.packSize}</p>
        ) : null}

        <div className="mt-auto pt-3">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              {options.canCheckout || product.price > 0 ? (
                <p className="font-figures text-[1.0625rem] font-bold leading-none text-medi-ink">
                  {formatPesewas(product.price)}
                  <span className="medi-meta ml-1 font-medium text-medi-muted">
                    / {product.unitOfSale}
                  </span>
                </p>
              ) : (
                <p className="text-[0.9375rem] font-semibold text-medi-ink">On request</p>
              )}
              {product.comparePrice ? (
                <p className="font-figures medi-meta mt-1 text-medi-muted line-through">
                  {formatPesewas(product.comparePrice)}
                </p>
              ) : null}
            </div>

            {options.primary ? (
              <button
                type="button"
                onClick={add}
                // Above the card's link overlay, or the click lands on the link.
                className={cn(
                  "medi-press medi-focus relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                  justAdded || inBasket
                    ? "bg-medi-success-soft text-medi-success"
                    : list === "cart"
                      ? "bg-medi-teal-600 text-white hover:bg-medi-teal-700"
                      : "bg-medi-mint-100 text-medi-teal-700 hover:bg-medi-mint-200",
                )}
                aria-label={
                  list === "cart"
                    ? `Add ${product.name} to cart`
                    : `Add ${product.name} to quotation list`
                }
              >
                {justAdded || inBasket ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : list === "cart" ? (
                  <Plus className="h-4 w-4" aria-hidden />
                ) : (
                  <FileText className="h-4 w-4" aria-hidden />
                )}
              </button>
            ) : null}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <AvailabilityBadge availability={product.availability} />
            {action ? (
              <span className="relative z-10 flex items-center">{action}</span>
            ) : !options.canCheckout && options.canQuote ? (
              <span className="medi-meta text-medi-muted">Quotation</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Announced rather than drawn: the tick on the button is the visible
          confirmation, and this is the same news for a screen reader. */}
      <span role="status" aria-live="polite" className="sr-only">
        {justAdded
          ? `${product.name} added to your ${list === "cart" ? "cart" : "quotation list"}`
          : ""}
      </span>
    </article>
  );
}

/**
 * What stands in for a photograph that has not been uploaded.
 *
 * The product's own initials on the brand's mint, not a grey box with a broken
 * picture glyph. A catalogue with gaps in it should look unfinished, not
 * broken — and the initials mean two placeholders beside each other are still
 * telling two different products apart.
 *
 * Set in teal-700 rather than the teal-400 it started as. Because the initials
 * carry meaning — they are how you tell two placeholders apart — they are text
 * and have to meet a contrast threshold like any other text. teal-400 on
 * mint-50 measures 2.38:1, under the 3:1 that even large text needs; teal-700
 * is 6.11:1. An axe run over the catalogue is what caught it, which is the
 * argument for running one rather than trusting the palette table.
 */
function ImagePlaceholder({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z0-9]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex h-full w-full items-center justify-center bg-medi-mint-50" aria-hidden>
      <span className="text-[1.75rem] font-bold tracking-tight text-medi-teal-700">
        {initials || "—"}
      </span>
    </div>
  );
}
