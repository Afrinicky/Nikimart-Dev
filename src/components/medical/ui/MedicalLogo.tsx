import { cn } from "@/lib/cn";

/**
 * The Nickimart Medical wordmark.
 *
 * Drawn rather than set as an image: it is two words at two weights plus one
 * mark, it has to sit on white and on the dark footer, and an SVG that scales
 * cleanly and inherits colour beats a pair of PNGs that do not.
 *
 * The mark is a cross cut from a rounded square, with the vertical bar broken
 * by a gap — a cross, and read again, a plus and a gap: the shape of a
 * pipette tip. It is not a caduceus, a heartbeat line or a helix, which are
 * the three things every medical supplier's logo already is.
 */
export function MedicalLogo({
  className,
  tone = "dark",
}: {
  className?: string;
  /** `dark` for white surfaces; `light` for the footer and the utility bar. */
  tone?: "dark" | "light";
}) {
  const word = tone === "light" ? "text-white" : "text-medi-ink";
  const sub = tone === "light" ? "text-medi-teal-300" : "text-medi-teal-600";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 32 32"
        className={cn("h-8 w-8 shrink-0", sub)}
        aria-hidden
        focusable="false"
      >
        <rect x="0" y="0" width="32" height="32" rx="9" fill="currentColor" />
        <path
          d="M13.1 7h5.8v5.1H24v5.8h-5.1V25h-5.8v-7.1H8v-5.8h5.1V7Z"
          fill="#fff"
          fillOpacity="0.95"
        />
        {/* The gap. Without it the mark is a medical cross and nothing else. */}
        <rect x="13.1" y="14.4" width="5.8" height="2.2" rx="1.1" fill="currentColor" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className={cn("text-[1.0625rem] font-extrabold tracking-[-0.03em]", word)}>
          Nickimart
        </span>
        <span
          className={cn(
            "mt-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.18em]",
            sub,
          )}
        >
          Medical
        </span>
      </span>
    </span>
  );
}
