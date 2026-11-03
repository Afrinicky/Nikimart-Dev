import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { ServiceModuleHeader } from "@/components/admin/ServiceModuleHeader";
import { FlyerDesigner } from "@/components/affiliate/FlyerDesigner";
import { requireDataAdmin } from "@/lib/data-bundles/session";
import { getLiveServices } from "@/lib/data-bundles/services";
import {
  SERVICE_FLYER_DEFAULT,
  defaultServiceMessage,
  getHouseServiceBranding,
  serviceFlyerData,
  serviceLink,
} from "@/lib/data-bundles/service-flyer";
import { saveHouseServiceFlyerDesign } from "@/lib/data-bundles/service-admin-actions";

export const metadata: Metadata = { title: "Service flyer — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What an agent's service share looks like.
 *
 * The same designer the affiliate flyer uses, against a service instead of a
 * product — deliberately, because it is the same flyer. An agent who has
 * shared a product has already shared one of these, and keeping one editor
 * means the two cannot drift into two sets of bugs.
 *
 * What is set here is the house style every agent starts from and keeps for
 * every part they have not overridden themselves. The picture inside the frame
 * is the one uploaded with the service.
 */
export default async function AdminServiceFlyerPage() {
  await requireDataAdmin();

  const [house, services] = await Promise.all([getHouseServiceBranding(), getLiveServices()]);

  // Design against a real listing: a designer previewing made-up data is a
  // designer who finds out about long names after the first share.
  const sample = services[0];
  const data = sample
    ? serviceFlyerData({
        service: {
          name: sample.name,
          tagline: sample.tagline,
          icon: sample.icon,
          accentFrom: sample.accentFrom,
          accentTo: sample.accentTo,
          fromPrice: sample.variants[0]?.price ?? 0,
          variants: sample.variants.map((v) => ({ ...v, sellPrice: v.price, costPrice: v.price, commission: 0 })),
        },
        storeName: "Nickimart",
        link: serviceLink(sample.slug),
        sharedBy: "Nickimart",
        message: defaultServiceMessage(sample.name, sample.variants[0]?.turnaround ?? ""),
      })
    : serviceFlyerData({
        service: {
          name: "Business registration",
          tagline: "Registrar-General filing, handled end to end",
          icon: "🏢",
          accentFrom: "#1d4ed8",
          accentTo: "#3b82f6",
          fromPrice: 450,
          variants: [],
        },
        storeName: "Nickimart",
        link: serviceLink("business-registration"),
        sharedBy: "Nickimart",
        message: defaultServiceMessage("business registration", "7 working days"),
      });

  return (
    <Container className="py-8">
      <ServiceModuleHeader />

      <section className="mt-6">
        <PanelHeading
          title="The house flyer"
          subtitle="Where every agent's service share starts. Their own changes layer on top, so what you set here reaches anybody who hasn't overridden that particular part."
        />
        <FlyerDesigner
          initial={house}
          fallback={SERVICE_FLYER_DEFAULT}
          fallbackLabel="the built-in design"
          sample={data}
          sampleImageUrl={sample?.imageUrl || null}
          action={saveHouseServiceFlyerDesign}
          savingLabel="Save the house design"
        />
      </section>

      <p className="mt-8 text-xs leading-relaxed text-niki-ink/50">
        Flyers are drawn in the browser from the service as it is priced right now, so nothing here
        is stored as an image and a price change never leaves an old one in circulation. The
        picture inside the frame is the one uploaded with the product.
      </p>
    </Container>
  );
}
