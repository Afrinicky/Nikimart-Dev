import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { ServiceModuleHeader } from "@/components/admin/ServiceModuleHeader";
import { ServiceSettingsForm } from "@/components/admin/ServiceSettingsForm";
import { requireDataAdmin } from "@/lib/data-bundles/session";
import { getServicesConfig } from "@/lib/data-bundles/settings";

export const metadata: Metadata = { title: "Service settings — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function AdminServiceSettingsPage() {
  await requireDataAdmin();
  const config = await getServicesConfig();

  return (
    <Container className="py-8">
      <ServiceModuleHeader />

      <section className="mt-6 max-w-3xl">
        <PanelHeading
          title="Settings"
          subtitle="Whether the shelf is open, where it is shown, and what a customer may attach."
        />
        <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <ServiceSettingsForm
            initial={{
              enabled: config.enabled,
              onStore: config.onStore,
              onHomepage: config.onHomepage,
              heading: config.heading,
              blurb: config.blurb,
              maxUploadMb: Math.round((config.maxUploadBytes / 1_000_000) * 10) / 10,
            }}
          />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-niki-ink/50">
          An agent decides for themselves which services appear on their own storefront, and each
          product carries its own switch for Nickimart&apos;s store. These three sit above all of
          them.
        </p>
      </section>
    </Container>
  );
}
