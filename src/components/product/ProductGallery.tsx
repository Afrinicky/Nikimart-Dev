"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductImagePlaceholder } from "@/components/product/ProductImagePlaceholder";

export function ProductGallery({
  images,
  gradientFrom,
  gradientTo,
  emoji,
  alt,
}: {
  images: string[];
  gradientFrom: string;
  gradientTo: string;
  emoji: string;
  alt: string;
}) {
  const [active, setActive] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const count = images.length;
  const current = images[active];

  const go = (dir: number) => setActive((a) => (count ? (a + dir + count) % count : 0));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || count < 2) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); // swipe left → next
    touchStartX.current = null;
  };

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-3xl ring-1 ring-niki-edge select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={alt} className="aspect-square w-full bg-white object-cover" draggable={false} />
        ) : (
          <ProductImagePlaceholder
            gradientFrom={gradientFrom}
            gradientTo={gradientTo}
            emoji={emoji}
            alt={alt}
            className="aspect-square w-full"
          />
        )}

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-niki-ink shadow-sm ring-1 ring-niki-edge transition hover:bg-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-niki-ink shadow-sm ring-1 ring-niki-edge transition hover:bg-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((url, i) => (
            <button
              key={`${url.slice(0, 24)}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              className={`h-16 w-16 overflow-hidden rounded-xl ring-2 transition-colors ${i === active ? "ring-niki-orange" : "ring-niki-edge hover:ring-niki-navy/20"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`${alt} thumbnail ${i + 1}`} className="h-full w-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
