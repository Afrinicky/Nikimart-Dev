import { permanentRedirect } from "next/navigation";

/**
 * The rules screen is gone.
 *
 * It priced a run by a scope — this point, that station, that category — and
 * sat beside the grid answering the same question, which meant a fee could
 * depend on which of the two screens somebody had edited last. The grid prices
 * every run now, base fee and increment together, one cell per journey.
 */
export default function RetiredShippingRatesPage(): never {
  permanentRedirect("/admin/shipping/lanes");
}
