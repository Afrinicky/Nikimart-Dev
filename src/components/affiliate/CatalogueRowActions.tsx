"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, ImageIcon, Loader2, MessageCircle, Minus, Plus } from "lucide-react";
import { addPromotedProduct, removePromotedProduct } from "@/lib/affiliate-console-actions";
import { renderShareMessage } from "@/lib/affiliate-policy";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The actions column, for the tables.
 *
 * The same four things the card offers, at the size a table row allows: add or
 * remove, copy the link, share it, open the flyer. Kept as one component so
 * the catalogue table and the my-products table cannot drift apart in what
 * they let somebody do.
 */
export function CatalogueRowActions({
  productId,
  productName,
  price,
  shopName,
  linkCode,
  selected,
  eligible,
  shareMessage,
  linkBase,
  from,
  suspended = false,
}: {
  productId: string;
  productName: string;
  price: number;
  shopName: string;
  linkCode: string | null;
  selected: boolean;
  eligible: boolean;
  shareMessage: string;
  linkBase: string;
  from: string;
  suspended?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const link = linkCode ? `${linkBase}/${linkCode}` : null;

  const chip =
    "niki-press niki-focus inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-60";

  function toggle() {
    const fd = new FormData();
    fd.set("productId", productId);
    fd.set("from", from);
    startTransition(async () => {
      if (selected) await removePromotedProduct(fd);
      else await addPromotedProduct(fd);
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Nothing useful to say in a table cell.
    }
  }

  function share() {
    if (!link) return;
    const text = renderShareMessage(shareMessage, {
      product: productName,
      price: formatPrice(price),
      link,
      shop: shopName,
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={cn(
          chip,
          selected
            ? "text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-surface"
            : "bg-niki-black text-white hover:bg-niki-ink",
        )}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : selected ? (
          <Minus className="h-3 w-3" />
        ) : (
          <Plus className="h-3 w-3" />
        )}
        {selected ? "Remove" : "Add"}
      </button>

      {selected && link ? (
        <>
          <button
            type="button"
            onClick={copy}
            className={cn(chip, "text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-surface")}
          >
            {copied ? <Check className="h-3 w-3 text-niki-success" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Link"}
          </button>
          {/* The flyer first — the picture, the caption and the link, which is
              what gets posted. Text-only is for dropping a link into a chat. */}
          <Link
            href={`/affiliate/products/${productId}`}
            title={
              eligible
                ? "Build the flyer: picture, your caption and your link"
                : "You can still share it — it just won't pay commission yet"
            }
            className={cn(chip, eligible ? "bg-niki-success text-white" : "bg-niki-black text-white")}
          >
            <ImageIcon className="h-3 w-3" />
            Flyer
          </Link>
          <button
            type="button"
            onClick={share}
            disabled={suspended}
            title={
              suspended
                ? "Your account is on hold"
                : "Send just the message and the link, with no picture"
            }
            className={cn(chip, "text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-surface")}
          >
            <MessageCircle className="h-3 w-3" />
            Text
          </button>
        </>
      ) : null}
    </div>
  );
}
