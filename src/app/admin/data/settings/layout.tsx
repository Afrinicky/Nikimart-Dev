import { Settings2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";

export const dynamic = "force-dynamic";

/**
 * Store settings, now a module of four tabs rather than one page.
 *
 * Backups belong here and not in a module of their own: this is where the
 * bundle business's own configuration lives, and protecting that database is
 * configuration of the same kind — it is about the store, not about a day's
 * orders. Keeping it a tab also keeps it out of the sidebar, which is already
 * thirteen entries long. Export sits beside it and stays a separate tab: the
 * two are easy to confuse and must not be, since only one of them can put the
 * database back.
 *
 * Developer is the fourth: API credentials and the fulfilment route, kept here
 * rather than in environment variables so the people who operate the store can
 * change them without a deploy. It is last because it is the tab you visit
 * once and then leave alone.
 */
export default function DataStoreSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="py-8">
      <ModuleHeader
        title="Data store settings"
        subtitle="How the bundle storefront presents itself, how its database is protected, and how its figures come out."
        icon={Settings2}
      />
      <div className="mt-5">
        <ModuleTabs
          tabs={[
            { href: "/admin/data/settings", label: "Storefront", icon: "settings", exact: true },
            { href: "/admin/data/settings/backups", label: "Backups", icon: "backup" },
            { href: "/admin/data/settings/export", label: "Export", icon: "sheet" },
            { href: "/admin/data/settings/developer", label: "Developer", icon: "code" },
          ]}
        />
      </div>
      <div className="mt-6">{children}</div>
    </Container>
  );
}
