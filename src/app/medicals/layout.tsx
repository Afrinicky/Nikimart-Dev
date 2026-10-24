import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import { BasketProvider } from "@/components/medical/providers/BasketProvider";
import { MedicalHeader } from "@/components/medical/layout/MedicalHeader";
import { MedicalFooter } from "@/components/medical/layout/MedicalFooter";
import { StorefrontChrome, StorefrontMain } from "@/components/medical/layout/StorefrontChrome";
import { getCategoryTree } from "@/lib/medical/categories";

/**
 * The display face for the medical business, loaded here rather than in the
 * root layout so the mall and the bundle storefront do not pay for a font they
 * never render. Next injects the preload for the routes that use it.
 *
 * Schibsted Grotesk was chosen against reflex: the three faces that came to
 * mind first for "clinical technical supplier" were Inter, IBM Plex Sans and
 * Space Grotesk, which is exactly why none of them is here. DESIGN.md has the
 * reasoning. One family carries headings, controls and text; contrast comes
 * from weight, and the figures come from Geist through `.font-figures`, which
 * the mall already established for the same reason — proportional digits make
 * a column of prices ragged.
 */
const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  display: "swap",
});

const DESCRIPTION =
  "Laboratory reagents, diagnostic kits, medical consumables and equipment for hospitals, laboratories and clinics in Ghana. Buy online or request a quotation.";

export const metadata: Metadata = {
  title: {
    default: "Nickimart Medical — Laboratory and medical supplies",
    template: "%s · Nickimart Medical",
  },
  description: DESCRIPTION,
  openGraph: {
    siteName: "Nickimart Medical",
    type: "website",
    title: "Nickimart Medical — Laboratory and medical supplies",
    description: DESCRIPTION,
  },
};

export default async function MedicalLayout({ children }: { children: React.ReactNode }) {
  // The sidebar and the header's category menu read the same tree. Fetched
  // once here rather than twice below; it is the one query both need and it is
  // cheap enough to carry on every medical page.
  const categories = await getCategoryTree({ sidebarOnly: true });

  return (
    <div className={`${schibsted.variable} medi flex min-h-screen flex-col`}>
      {/* The cart and the quotation list are one store, and the header reads
          both counts from it — so it wraps the whole medical tree rather than
          each page that happens to need it. */}
      <BasketProvider>
        {/* The console lives under /medicals/admin and draws its own frame, so
            the shop's header and footer are gated out of it. */}
        <StorefrontChrome>
          <MedicalHeader categories={categories} />
        </StorefrontChrome>
        <StorefrontMain className="flex-1">{children}</StorefrontMain>
        <StorefrontChrome>
          <MedicalFooter categories={categories} />
        </StorefrontChrome>
      </BasketProvider>
    </div>
  );
}
