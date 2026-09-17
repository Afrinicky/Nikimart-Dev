import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { DataStoreSettingsForm } from "@/components/admin/DataStoreSettingsForm";
import { getDataSettings } from "@/lib/data-bundles/settings";

export const metadata: Metadata = { title: "Data Store Settings — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function AdminDataSettingsPage() {
  const settings = await getDataSettings();

  return (
    <Container className="max-w-2xl py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-niki-ink">Data store settings</h1>
        <p className="mt-1 text-sm text-niki-ink/60">
          Branding, availability and pricing defaults for the bundle storefront. The agent
          programme has its own settings under Agents → Programme settings. Payments and SMS use
          Nickimart&apos;s existing Paystack and Arkesel accounts — nothing extra to configure.
        </p>
      </div>
      <div className="mt-6">
        <DataStoreSettingsForm settings={settings} />
      </div>
    </Container>
  );
}
