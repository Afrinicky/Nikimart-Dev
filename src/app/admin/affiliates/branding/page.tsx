import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { FlyerDesigner } from "@/components/affiliate/FlyerDesigner";
import { WatermarkDesigner } from "@/components/affiliate/WatermarkDesigner";
import { requireDashboard } from "@/lib/session";
import { getHouseBranding, getSampleProduct } from "@/lib/affiliate-branding";
import { DEFAULT_FLYER_DESIGN } from "@/lib/affiliate-flyer";
import {
  saveAffiliateWatermark,
  saveHouseFlyerDesign,
} from "@/lib/affiliate-admin-actions";

export const metadata: Metadata = { title: "Affiliate branding — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What an affiliate's shares look like.
 *
 * Two things, because a share is one of two things. The flyer is the poster —
 * frame, headline, price, footer — and what is set here is the house style
 * every affiliate starts from and keeps for every part they do not override
 * themselves. The watermark is the mark on a shared photograph, which is
 * otherwise completely untouched; that one is not theirs to change, because a
 * mark anybody could rewrite would not be a mark.
 */
export default async function AdminAffiliateBrandingPage() {
  await requireDashboard("/admin");
  const [branding, sample] = await Promise.all([getHouseBranding(), getSampleProduct()]);

  return (
    <Container className="py-8">
      <AffiliateModuleHeader />

      <section className="mt-6">
        <PanelHeading
          title="The house flyer"
          subtitle="Where every affiliate starts. Their own changes layer on top of this, so what you set here reaches anybody who hasn't overridden that particular part."
        />
        <FlyerDesigner
          initial={branding.house}
          fallback={DEFAULT_FLYER_DESIGN}
          fallbackLabel="the built-in design"
          sample={sample.data}
          sampleImageUrl={sample.imageUrl}
          action={saveHouseFlyerDesign}
          savingLabel="Save the house design"
        />
      </section>

      <section className="mt-10">
        <PanelHeading
          title="The photo watermark"
          subtitle="An affiliate can share the product's own picture instead of a flyer — no frame, no lettering. This is the only mark that goes on it."
        />
        <WatermarkDesigner
          initial={branding.watermark}
          sample={sample.data}
          sampleImageUrl={sample.imageUrl}
          logoUrl={branding.logoUrl}
          design={branding.house}
          action={saveAffiliateWatermark}
        />
      </section>

      <p className="mt-8 text-xs leading-relaxed text-niki-ink/50">
        Both are drawn in the browser from the listing as it is priced right now, so nothing here is
        stored as an image and a price change never leaves an old one in circulation. The brand logo
        the watermark can carry is the one set in{" "}
        <Link href="/admin/settings" className="font-semibold text-niki-orange hover:underline">
          Settings
        </Link>
        .
      </p>
    </Container>
  );
}
