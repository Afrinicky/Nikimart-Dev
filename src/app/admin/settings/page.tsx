import type { Metadata } from "next";
import { Scale } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
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
    <Container className="max-w-2xl py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-niki-ink">Site settings</h1>
        <p className="mt-1 text-sm text-niki-ink/60">
          Delivery fee, contact details, and footer content used across the site.
        </p>
      </div>
      <ActionLink
        href="/admin/legal"
        className="niki-lift mt-6 flex items-center gap-3 rounded-2xl bg-white p-5 ring-1 ring-niki-edge-strong hover:ring-niki-orange/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-navy text-niki-orange">
          <Scale className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-niki-ink">Terms &amp; policies</span>
          <span className="mt-0.5 block text-sm text-niki-ink/60">
            Edit the terms, privacy, returns, seller and agent policies people accept at
            registration.
          </span>
        </span>
      </ActionLink>

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
