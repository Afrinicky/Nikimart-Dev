import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Palette } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { FlyerDesigner } from "@/components/affiliate/FlyerDesigner";
import { ResetFlyerDesignButton } from "@/components/affiliate/ResetFlyerDesignButton";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import { getAffiliateBranding, getSampleProduct } from "@/lib/affiliate-branding";
import { saveFlyerDesign } from "@/lib/affiliate-console-actions";

export const metadata: Metadata = { title: "Flyer design — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The affiliate's own flyer.
 *
 * Nickimart sets a house style and this is where somebody makes it theirs:
 * the colours, how much of the flyer the product takes up, every line's type,
 * which lines are on it at all, and lines of their own. What they do not
 * change keeps following the house design, so an admin's change to it still reaches
 * them.
 */
export default async function AffiliateFlyerDesignPage() {
  const { affiliate } = await requireAffiliateConsole();
  const [branding, sample] = await Promise.all([
    getAffiliateBranding(affiliate),
    getSampleProduct(),
  ]);

  return (
    <div>
      <Link
        href="/affiliate/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/55 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Settings
      </Link>

      <ModuleHeader
        title="Flyer design"
        subtitle="Make the flyer yours. Anything you leave alone keeps following Nickimart's house style."
        icon={Palette}
      >
        {branding.custom ? <ResetFlyerDesignButton /> : null}
      </ModuleHeader>

      <div className="mt-5">
        <FlyerDesigner
          initial={branding.design}
          fallback={branding.house}
          fallbackLabel="the house design"
          sample={sample.data}
          sampleImageUrl={sample.imageUrl}
          action={saveFlyerDesign}
          custom={branding.custom}
          savingLabel="Save my design"
        />
      </div>

      <p className="mt-8 text-xs leading-relaxed text-niki-ink/50">
        The preview is a real flyer, drawn the way it will be shared — only the product is a sample.
        Sharing a product&apos;s own photograph instead of a flyer uses Nickimart&apos;s watermark,
        which is the same for everybody.
      </p>
    </div>
  );
}
