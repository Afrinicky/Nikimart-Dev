import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings — Admin — NikiMart" };

export default async function AdminSettingsPage() {
  const settings = await getSettings();

  return (
    <Container className="max-w-2xl py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-niki-ink">Site settings</h1>
        <p className="mt-1 text-sm text-niki-ink/60">
          Delivery fee, contact details, and footer content used across the site.
        </p>
      </div>
      <div className="mt-6">
        <SettingsForm settings={settings} />
      </div>
    </Container>
  );
}
