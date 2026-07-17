"use client";

import { useState } from "react";
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
  const current = images[active];

  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl ring-1 ring-black/5">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={alt} className="aspect-square w-full bg-white object-cover" />
        ) : (
          <ProductImagePlaceholder
            gradientFrom={gradientFrom}
            gradientTo={gradientTo}
            emoji={emoji}
            alt={alt}
            className="aspect-square w-full"
          />
        )}
      </div>

      {images.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((url, i) => (
            <button
              key={`${url.slice(0, 24)}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              className={`h-16 w-16 overflow-hidden rounded-xl ring-2 transition-colors ${i === active ? "ring-niki-orange" : "ring-black/5 hover:ring-niki-navy/20"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`${alt} thumbnail ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
