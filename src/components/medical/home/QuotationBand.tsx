import { ArrowRight } from "lucide-react";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import type { HomepageBlock } from "@/lib/medical/homepage";

/**
 * The second and last place colour takes over a section.
 *
 * It earns it: the quotation request is the single action this business most
 * needs a visitor to take, and it is also the one a visitor is least likely to
 * know exists. Everything else on the page is white.
 *
 * The copy makes the unlisted-item case explicitly, because that is the
 * request worth the most and the one a catalogue search quietly turns away.
 */
export function QuotationBand({ block }: { block: HomepageBlock | null }) {
  const title = block?.title || "Send us a list. We will price it.";
  const body =
    block?.body ||
    "Several items at once, including things that are not on this site. Tell us the quantities and we will come back with prices, lead times and terms — usually the same day.";

  return (
    <section className="medi-band-cta medi-panel-lg relative isolate overflow-hidden px-6 py-12 sm:px-12 sm:py-14">
      <div className="relative max-w-2xl">
        <h2 className="medi-h1 text-white">{title}</h2>
        <p className="medi-lede mt-4 text-white/80">{body}</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <MedicalButtonLink
            href={block?.ctaHref || "/medicals/quotations/new"}
            variant="onDark"
            size="lg"
          >
            {block?.ctaLabel || "Request a quotation"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </MedicalButtonLink>
          <p className="text-[0.875rem] text-white/70">
            No account needed. Nothing is charged for asking.
          </p>
        </div>
      </div>
    </section>
  );
}
