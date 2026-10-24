"use client";

import { FileText, ShoppingCart } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { useBasket } from "@/components/medical/providers/BasketProvider";
import { cn } from "@/lib/cn";

/**
 * The two baskets in the header.
 *
 * Both are shown, always, even at zero — an icon that appears once something
 * is in it is an icon nobody learns is there, and the quotation list is the
 * one this business most needs people to find.
 *
 * The count renders only once the stored basket has been read. A server render
 * that says nothing, flipping to "3" when the browser catches up, is a
 * hydration mismatch and reads as a glitch in the first second of the page.
 */
export function BasketCounts() {
  const { ready, count } = useBasket();
  const cart = ready ? count("cart") : 0;
  const quote = ready ? count("quote") : 0;

  return (
    <>
      <BasketButton
        href="/medicals/quotation-list"
        label="Quotation list"
        count={quote}
        ready={ready}
        icon={<FileText className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
      />
      <BasketButton
        href="/medicals/cart"
        label="Cart"
        count={cart}
        ready={ready}
        icon={<ShoppingCart className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
      />
    </>
  );
}

function BasketButton({
  href,
  label,
  count,
  ready,
  icon,
}: {
  href: string;
  label: string;
  count: number;
  ready: boolean;
  icon: React.ReactNode;
}) {
  return (
    <MedicalLink
      href={href}
      // The count is in the label rather than only in the badge: "Cart" tells a
      // screen-reader user nothing about whether anything is in it.
      aria-label={count > 0 ? `${label}, ${count} ${count === 1 ? "item" : "items"}` : label}
      className="medi-focus relative flex h-11 w-11 items-center justify-center rounded-xl text-medi-ink hover:bg-medi-mint-50"
    >
      {icon}
      {ready && count > 0 ? (
        <span
          aria-hidden
          className={cn(
            "font-figures animate-scale-in absolute right-1 top-1 flex h-[1.125rem] min-w-[1.125rem]",
            "items-center justify-center rounded-full bg-medi-teal-600 px-1",
            "text-[0.625rem] font-bold leading-none text-white",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </MedicalLink>
  );
}
