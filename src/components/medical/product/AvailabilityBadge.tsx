import { cn } from "@/lib/cn";
import { AVAILABILITY_LABEL } from "@/lib/medical/purchase-mode";
import type { Availability } from "@/lib/medical/catalogue";

/**
 * Stock, as a word.
 *
 * Colour is never the only signal. "In stock" is green and says "In stock";
 * somebody who cannot distinguish the green from the amber still reads the
 * same fact, and so does anyone looking at a printed page or a screenshot in a
 * procurement email.
 *
 * The dot is not decoration — it is what makes the four states scannable down
 * a column of search results, where the words all start with the same two
 * letters at a glance.
 */

const TONE: Record<Availability["kind"], { text: string; dot: string }> = {
  IN_STOCK: { text: "text-medi-success", dot: "bg-medi-success" },
  LOW_STOCK: { text: "text-medi-warning", dot: "bg-medi-warning" },
  TO_ORDER: { text: "text-medi-info", dot: "bg-medi-info" },
  OUT_OF_STOCK: { text: "text-medi-muted", dot: "bg-medi-disabled" },
};

export function AvailabilityBadge({
  availability,
  className,
}: {
  availability: Availability;
  className?: string;
}) {
  const tone = TONE[availability.kind];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[0.75rem] font-semibold", tone.text, className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
      {AVAILABILITY_LABEL[availability.kind]}
    </span>
  );
}
