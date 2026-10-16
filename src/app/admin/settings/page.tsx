import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { EmailDeliveryPanel } from "@/components/admin/EmailDeliveryPanel";
import { getSettings } from "@/lib/settings";
import { emailStatus } from "@/lib/notifications";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Settings — Admin — Nickimart" };

export default async function AdminSettingsPage() {
  const [settings, admin] = await Promise.all([getSettings(), requireAdmin()]);
  const email = emailStatus();

  return (
    <Container className="max-w-2xl py-6 sm:py-8">
      <div>
        <h2 className="font-display text-lg font-bold text-niki-ink sm:text-xl">Site settings</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Delivery fee, contact details, and footer content used across the site.
        </p>
      </div>

      <div className="mt-6">
        <EmailDeliveryPanel
          readiness={email.readiness}
          detail={email.detail}
          from={email.from}
          defaultTo={admin.email ?? ""}
        />
      </div>

      <div className="mt-6">
        <SettingsForm settings={settings} />
      </div>
    </Container>
  );
}
