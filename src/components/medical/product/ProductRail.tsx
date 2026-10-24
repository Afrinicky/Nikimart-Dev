"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/medical/product/ProductCard";
import type { ProductSummary } from "@/lib/medical/catalogue";
import { cn } from "@/lib/cn";

/**
 * A horizontal row of products.
 *
 * Used where a section is a sample of a category rather than the category
 * itself — the homepage rails. A grid would commit the full height of three
 * rows to something the visitor is meant to glance at and move past.
 *
 * The arrows appear only when there is somewhere to go, and are hidden from
 * assistive technology entirely: they are a convenience over a scroll
 * container that is already keyboard-scrollable and already swipeable. An
 * arrow that announces itself as a button and then does nothing at the end of
 * the rail is worse than no arrow.
 */
export function ProductRail({
  products,
  className,
}: {
  products: ProductSummary[];
  className?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const node = rail.current;
    if (!node) return;
    const { scrollLeft, scrollWidth, clientWidth } = node;
    // A pixel of slack: sub-pixel layout means scrollLeft rarely reaches
    // scrollWidth - clientWidth exactly, and the end arrow would never hide.
    setEdges({
      start: scrollLeft > 1,
      end: scrollLeft < scrollWidth - clientWidth - 1,
    });
  }, []);

  useEffect(() => {
    measure();
    const node = rail.current;
    if (!node) return;
    // The rail's own width changes with the viewport, and so does whether
    // there is anything to scroll to.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, products.length]);

  function scrollBy(direction: 1 | -1) {
    const node = rail.current;
    if (!node) return;
    // Most of a viewport, not all of it: leaving a card visible on the far
    // edge is what tells somebody the row continued rather than jumped.
    node.scrollBy({ left: direction * node.clientWidth * 0.82, behavior: "smooth" });
  }

  if (products.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={rail}
        onScroll={measure}
        className="medi-rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            className="w-[15.5rem] shrink-0 sm:w-[16.5rem]"
          />
        ))}
      </div>

      <RailArrow side="start" show={edges.start} onClick={() => scrollBy(-1)} />
      <RailArrow side="end" show={edges.end} onClick={() => scrollBy(1)} />
    </div>
  );
}

function RailArrow({
  side,
  show,
  onClick,
}: {
  side: "start" | "end";
  show: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-hidden
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        "absolute top-[7.5rem] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full",
        "bg-white text-medi-ink shadow-[0_4px_16px_-4px_oklch(0.255_0.045_243/0.3)]",
        "ring-1 ring-medi-rule transition-opacity duration-200 hover:bg-medi-mint-50",
        side === "start" ? "-left-5" : "-right-5",
        show ? "lg:flex" : "pointer-events-none lg:flex lg:opacity-0",
      )}
    >
      {side === "start" ? (
        <ChevronLeft className="h-5 w-5" aria-hidden />
      ) : (
        <ChevronRight className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}
