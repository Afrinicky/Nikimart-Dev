/**
 * The Nickimart mark, inline.
 *
 * A bold W whose first stroke carries on upward into a shopping-cart push
 * handle, three motion lines trailing to the left, and two wheels below. The
 * same geometry ships as `/logo.svg` for anywhere that needs a file (email,
 * Open Graph cards, an admin preview); this is the copy the app itself draws.
 *
 * Inline rather than an <img> because the mark sits next to the wordmark in the
 * header, where a separate request can land a frame late and shove the layout
 * sideways, and because it inherits `currentColor` — the same component is the
 * orange mark on white chrome and the white mark on a dark panel, with no
 * second asset to keep in sync.
 */
export function BrandMark({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1076 795"
      className={className}
      fill="currentColor"
      role="img"
      aria-label="Nickimart"
    >
      <path d="M392 28 L516 28 L589 329 L632 129 L756 129 L814 399 L924 129 L1048 129 L857 599 L733 599 L694 416 L654 599 L530 599 Z" />
      <rect x="28" y="28" width="402" height="74" rx="25" />
      <rect x="28" y="234" width="209" height="50" rx="25" />
      <rect x="87" y="364" width="205" height="50" rx="25" />
      <rect x="147" y="494" width="200" height="50" rx="25" />
      <circle cx="592" cy="707" r="60" />
      <circle cx="795" cy="707" r="60" />
    </svg>
  );
}
