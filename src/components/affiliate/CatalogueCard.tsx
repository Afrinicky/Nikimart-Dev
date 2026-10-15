"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  ImageIcon,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  Store,
} from "lucide-react";
import {
  addPromotedProduct,
  removePromotedProduct,
} from "@/lib/affiliate-console-actions";
import { SelectBox } from "@/components/affiliate/BulkShare";
import { renderShareMessage } from "@/lib/affiliate-policy";
import { discountPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * One product, in affiliate terms.
 *
 * Used by the catalogue and by the affiliate's view of the storefront, which
 * is the point: the row an affiliate sees while browsing is the row they act
 * on, so adding something to their list never means finding it again somewhere
 * else. Every card says the same four things — what it is, what it costs, what
 * it pays and who funds that — and a product that pays nothing says so rather
 * than hiding.
 */

export interface CatalogueCardProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  oldPrice: number | null;
  image: string | null;
  emoji: string;
  gradientFrom: string;
  gradientTo: string;
  shopName: string;
  shopSlug: string;
  categoryName: string;
  eligible: boolean;
  rate: number;
  earnPerSale: number;
  fundedBy: string;
  reason: string;
  selected: boolean;
  linkCode: string | null;
}

export function CatalogueCard({
  product,
  /** The caption to share with it, already resolved. */
  shareMessage,
  /** Where the link points, built from the link code. */
  linkBase,
  /** The path to come back to after adding or removing. */
  from,
  suspended = false,
}: {
  product: CatalogueCardProduct;
  shareMessage: string;
  linkBase: string;
  from: string;
  suspended?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const link = product.linkCode ? `${linkBase}/${product.linkCode}` : null;
  const off = discountPercent(product.price, product.oldPrice ?? undefined);

  // What the bulk share needs if this card is ticked. Built here, from the
  // same numbers the card prints, so a selection can never carry a price the
  // card is not showing.
  const selectable = {
    id: product.id,
    name: product.name,
    price: formatPrice(product.price),
    oldPrice: product.oldPrice ? formatPrice(product.oldPrice) : null,
    discount: off ? `-${off}%` : null,
    image: product.image,
    emoji: product.emoji,
    gradientFrom: product.gradientFrom,
    gradientTo: product.gradientTo,
    shopName: product.shopName,
    categoryName: product.categoryName,
    linkCode: product.linkCode,
    eligible: product.eligible,
  };

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The flyer screen prints the link in full; nothing to report here.
    }
  }

  function share() {
    if (!link) return;
    const text = renderShareMessage(shareMessage, {
      product: product.name,
      price: formatPrice(product.price),
      link,
      shop: product.shopName,
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  function toggle() {
    const fd = new FormData();
    fd.set("productId", product.id);
    fd.set("from", from);
    startTransition(async () => {
      if (product.selected) await removePromotedProduct(fd);
      else await addPromotedProduct(fd);
    });
  }

  return (
    <li className="relative flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-niki-edge">
      {/* Over the picture but outside the link, so ticking never navigates. */}
      <SelectBox
        product={selectable}
        className="absolute left-2 top-11 z-10 h-7 w-7 rounded-lg bg-white/90 shadow-sm ring-1 ring-niki-edge backdrop-blur"
      />

      <Link href={`/affiliate/shop/${product.slug}`} className="block">
        <span
          className="relative flex aspect-square w-full items-center justify-center overflow-hidden"
          style={{
            background: product.image
              ? undefined
              : `linear-gradient(135deg, ${product.gradientFrom}, ${product.gradientTo})`,
          }}
        >
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
            />
          ) : (
            <span className="text-5xl" aria-hidden>
              {product.emoji}
            </span>
          )}

          {product.eligible ? (
            <span className="absolute left-2 top-2 rounded-lg bg-niki-success px-2 py-1 text-[10px] font-bold text-white shadow-sm">
              {product.rate}% commission
            </span>
          ) : (
            <span className="absolute left-2 top-2 rounded-lg bg-niki-black/70 px-2 py-1 text-[10px] font-bold text-white shadow-sm">
              Not in the programme
            </span>
          )}

          {product.selected ? (
            <span className="absolute right-2 top-2 flex h-7 items-center gap-1 rounded-lg bg-niki-orange px-2 text-[10px] font-bold text-white shadow-sm">
              <Check className="h-3 w-3" /> On my list
            </span>
          ) : null}
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-3.5">
        <Link
          href={`/affiliate/shop/${product.slug}`}
          className="line-clamp-2 text-sm font-semibold text-niki-ink hover:text-niki-orange"
        >
          {product.name}
        </Link>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-niki-ink/50">
          <Store className="h-3 w-3 shrink-0" />
          <Link href={`/affiliate/shop/shops/${product.shopSlug}`} className="truncate hover:text-niki-orange">
            {product.shopName}
          </Link>
          <span aria-hidden>·</span>
          <span className="truncate">{product.categoryName}</span>
        </p>

        <div className="mt-2.5 flex items-baseline justify-between gap-2 border-t border-niki-edge pt-2.5">
          <span className="font-figures text-sm font-bold text-niki-ink">
            {formatPrice(product.price)}
            {product.oldPrice ? (
              <span className="ml-1.5 text-[11px] font-medium text-niki-ink/40 line-through">
                {formatPrice(product.oldPrice)}
              </span>
            ) : null}
          </span>
          {product.eligible ? (
            <span className="text-right">
              <span className="font-figures text-sm font-bold text-niki-success">
                +{formatPrice(product.earnPerSale)}
              </span>
              <span
                className="ml-1 text-[10px] text-niki-ink/45"
                title={
                  product.fundedBy === "platform"
                    ? "Nickimart funds this commission"
                    : "The shop funds this commission"
                }
              >
                {product.fundedBy === "platform" ? "NM" : "shop"}
              </span>
            </span>
          ) : null}
        </div>

        {!product.eligible && product.reason ? (
          <p className="mt-2 text-[11px] leading-relaxed text-niki-ink/45">{product.reason}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className={cn(
              "niki-press niki-focus inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-60",
              product.selected
                ? "text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-surface"
                : "bg-niki-black text-white hover:bg-niki-ink",
            )}
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : product.selected ? (
              <Minus className="h-3 w-3" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            {product.selected ? "Remove" : "Add to my list"}
          </button>

          {product.selected && link ? (
            <>
              <button
                type="button"
                onClick={copy}
                className="niki-press niki-focus inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-surface"
              >
                {copied ? <Check className="h-3 w-3 text-niki-success" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Link"}
              </button>
              {/* The flyer is the primary way out of here: a picture, the
                  caption and the link, which is what actually gets opened in
                  WhatsApp. The text-only share stays for the moment somebody
                  just needs to drop a link into a chat. */}
              <Link
                href={`/affiliate/products/${product.id}`}
                className="niki-press niki-focus inline-flex items-center gap-1 rounded-full bg-niki-success px-2.5 py-1.5 text-[11px] font-bold text-white"
              >
                <ImageIcon className="h-3 w-3" />
                Share flyer
              </Link>
              <button
                type="button"
                onClick={share}
                disabled={suspended}
                className="niki-press niki-focus inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-surface disabled:opacity-50"
                title="Send just the message and the link, with no picture"
              >
                <MessageCircle className="h-3 w-3" />
                Text only
              </button>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}
