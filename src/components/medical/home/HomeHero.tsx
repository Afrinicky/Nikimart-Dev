import { ArrowRight, FileText } from "lucide-react";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import type { HomepageBlock } from "@/lib/medical/homepage";

/**
 * The first screen.
 *
 * One dark teal panel carrying a photograph, which is the only place on the
 * site where colour takes over a whole area — the homepage is the one surface
 * allowed to be loud, and one is the number.
 *
 * The headline and both buttons come from the database, so the business can
 * change what the first screen says without a deploy. The fallbacks below are
 * what it says before anybody has: a plain description of what is sold and to
 * whom, with no claim in it that cannot be stood behind.
 *
 * What is deliberately absent: a quality badge, a customer count, a star
 * rating, a shipping promise. The reference design has all four stacked above
 * the headline. They are the first thing a procurement officer discounts and
 * the first thing that makes a supplier look like a reseller.
 */
export function HomeHero({ block }: { block: HomepageBlock | null }) {
  const title = block?.title || "Laboratory and medical supplies, sourced properly.";
  const body =
    block?.body ||
    "Reagents, diagnostics, consumables and equipment for hospitals, laboratories and clinics across Ghana. Buy what we hold in stock, or send us a list and we will price it.";
  const image = block?.image || "/medical/hero.webp";
  const imageAlt =
    block?.imageAlt ||
    "Reagent bottles, a micropipette, a rack of capped test tubes, examination gloves and a benchtop analyser arranged on a pale surface";

  const primary = {
    label: block?.ctaLabel || "Browse the catalogue",
    href: block?.ctaHref || "/medicals/categories",
  };
  const secondary = {
    label: block?.secondaryCtaLabel || "Request a quotation",
    href: block?.secondaryCtaHref || "/medicals/quotations/new",
  };

  return (
    <section className="medi-band-hero medi-panel-lg relative isolate flex flex-col overflow-hidden lg:min-h-[25rem] lg:justify-center">
      {/* On a wide screen the photograph fills the panel and the scrim sits
          over it, rather than the photograph occupying a column of its own.
          A column has an edge, and an edge down the middle of a hero reads as
          two images that failed to line up. Filling and scrimming lets the
          instruments stay at the right of frame and the type sit on what is
          effectively a dark panel that happens to be a photograph.

          `object-right` because that is where the objects are — the left third
          of this frame is deliberately empty, which is what makes it a hero
          photograph rather than a product shot. */}
      <div className="absolute inset-0 hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element -- the hero may be
            replaced by an administrator-uploaded URL of unknown dimensions. */}
        <img
          src={image}
          alt={imageAlt}
          fetchPriority="high"
          className="h-full w-full object-cover object-right"
        />
        <div aria-hidden className="medi-hero-scrim absolute inset-0" />
      </div>

      <div className="relative px-6 py-11 sm:px-10 sm:py-14 lg:w-[60%] lg:py-14 lg:pl-12 lg:pr-10">
        <h1 className="medi-display animate-fade-up text-white">{title}</h1>
        {block?.subtitle ? (
          <p className="animate-fade-up mt-3 text-[1.0625rem] font-semibold text-medi-teal-300 [animation-delay:60ms]">
            {block.subtitle}
          </p>
        ) : null}
        <p className="medi-lede animate-fade-up mt-5 text-white/80 [animation-delay:90ms]">{body}</p>

        <div className="animate-fade-up mt-8 flex flex-wrap gap-3 [animation-delay:150ms]">
          <MedicalButtonLink href={primary.href} variant="onDark" size="lg">
            {primary.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </MedicalButtonLink>
          <MedicalButtonLink
            href={secondary.href}
            size="lg"
            className="bg-white/10 text-white shadow-[inset_0_0_0_1px_var(--color-medi-rule-light)] hover:bg-white/15"
          >
            <FileText className="h-4 w-4" aria-hidden />
            {secondary.label}
          </MedicalButtonLink>
        </div>
      </div>

      {/* On a phone the photograph goes under the copy at its own height,
          because a scrim over a frame this narrow would hide the objects
          entirely and leave a dark rectangle. `alt=""` because the heading
          above has already said what this is — announcing it twice is noise. */}
      <div className="relative lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
        <img src={image} alt="" aria-hidden className="h-48 w-full object-cover sm:h-60" />
      </div>
    </section>
  );
}
