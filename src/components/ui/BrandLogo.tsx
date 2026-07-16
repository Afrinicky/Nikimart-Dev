"use client";

import { useState } from "react";

/**
 * Brand logo badge. Renders the uploaded logo from /public/logo.png when it is
 * present, and gracefully falls back to the original gradient "N" mark if the
 * file is missing or fails to load — so the header/footer never break while the
 * artwork is being added. Drop the logo at `public/logo.png` (or .svg and set
 * `src`) and it appears everywhere automatically.
 */
export function BrandLogo({
  className = "h-9 w-9",
  src = "/logo.png",
}: {
  className?: string;
  src?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-niki-orange to-niki-gold font-display text-lg font-bold text-niki-navy ${className}`}
      >
        N
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="NikiMart"
      onError={() => setFailed(true)}
      className={`rounded-xl object-contain ${className}`}
    />
  );
}
