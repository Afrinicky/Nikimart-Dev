"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The product's images.
 *
 * `object-contain` on a near-white panel rather than `cover`: these are
 * catalogue shots of objects on white, and cropping one to fill a frame cuts
 * the top off a microscope. The thumbnail strip only appears when there is
 * more than one, because a single thumbnail under a single image is a control
 * that does nothing.
 */
export function ProductGallery({
  images,
  name,
}: {
  images: { url: string; alt: string }[];
  name: string;
}) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  if (!current) {
    return (
      <div className="medi-panel flex aspect-[4/3] items-center justify-center bg-medi-mint-50">
        <span className="text-[2rem] font-bold tracking-tight text-medi-teal-700" aria-hidden>
          {initialsOf(name)}
        </span>
        <span className="sr-only">No photograph of this product has been published yet.</span>
      </div>
    );
  }

  return (
    <div>
      <div className="medi-panel medi-panel-lg aspect-[4/3] overflow-hidden bg-medi-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- administrator
            uploads of unknown dimensions, sometimes as data URLs. */}
        <img
          src={current.url}
          alt={current.alt || name}
          className="h-full w-full object-contain p-6"
        />
      </div>

      {images.length > 1 ? (
        <ul className="mt-3 flex gap-2.5">
          {images.map((image, index) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Show image ${index + 1} of ${images.length}`}
                aria-current={index === active}
                className={cn(
                  "medi-focus h-16 w-16 overflow-hidden rounded-xl bg-medi-surface transition-shadow",
                  index === active
                    ? "shadow-[inset_0_0_0_2px_var(--color-medi-teal-600)]"
                    : "shadow-[inset_0_0_0_1px_var(--color-medi-rule)] hover:shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)]",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
                <img src={image.url} alt="" className="h-full w-full object-contain p-1.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((word) => /^[A-Za-z0-9]/.test(word))
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "—"
  );
}
