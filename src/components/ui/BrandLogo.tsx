"use client";

import { useState } from "react";
import { BrandMark } from "./BrandMark";

/**
 * The brand mark as the site actually shows it.
 *
 * By default this is {@link BrandMark}, drawn inline: no request, nothing to
 * fail, and it takes its colour from whatever it sits on. An admin who has set
 * a custom logo in Settings gets that image instead — and if the URL is broken
 * or the host is down, it falls back to the built-in mark rather than leaving a
 * hole in the header on every page of the site.
 */
export function BrandLogo({
  className = "h-8 w-auto",
  src,
}: {
  className?: string;
  /** Logo URL (admin-configurable). Empty/undefined → the built-in mark. */
  src?: string;
}) {
  const [failed, setFailed] = useState(false);
  const custom = src?.trim();

  if (!custom || failed) return <BrandMark className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={custom}
      alt="Nickimart"
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
    />
  );
}
