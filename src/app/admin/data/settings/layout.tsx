import { Settings2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";

export const dynamic = "force-dynamic";

/**
 * Store settings, now a module with two tabs rather than one page.
 *
 * Backups belong here and not in a module of their own: this is where the
 * bundle business's own configuration lives, and protecting that database is
 * configuration of the same kind — it is about the store, not about a day's
 * orders. Keeping it a tab also keeps it out of the sidebar, which is already
 * thirteen entries long.
 */
export default function DataStoreSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="py-8">
      <ModuleHeader
        title="Data store settings"
        subtitle="How the bundle storefront presents itself, and how its database is protected."
        icon={Settings2}
      />
      <div className="mt-5">
        <ModuleTabs
          tabs={[
            { href: "/admin/data/settings", label: "Storefront", icon: "settings", exact: true },
            { href: "/admin/data/settings/backups", label: "Backups", icon: "backup" },
          ]}
        />
      </div>
      <div className="mt-6">{children}</div>
    </Container>
  );
}
