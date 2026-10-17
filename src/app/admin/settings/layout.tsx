import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Container } from "@/components/ui/Container";
import { SettingsNav } from "@/components/admin/SettingsNav";
import { requireDashboard } from "@/lib/session";

/**
 * How the storefront is set up.
 *
 * The categories buyers browse, the pages they land on, the carousel they
 * see first, the questions they ask and the terms they accept were five
 * sidebar entries of their own — which made the sidebar a list of tables and
 * buried the settings that run the shop among them. One module, six tabs.
 */
export default async function AdminSettingsLayout({ children }: { children: ReactNode }) {
  await requireDashboard("/admin");

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="What the storefront is made of, and the figures that run it."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Settings" }]}
      />
      <Container className="pt-5 sm:pt-6">
        <SettingsNav />
      </Container>
      {children}
    </>
  );
}
