import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { CARRIER_CATALOG } from "@/lib/data-bundles/carriers/rules";

export const dynamic = "force-dynamic";

/**
 * A tab per carrier, inside the Developer tab.
 *
 * Setting up MTN has nothing to do with setting up Telecel: different
 * credentials, different portal, different person waiting on a reply from a
 * different account manager. One page holding all three meant scrolling past
 * two finished integrations to reach the one being worked on, and it would
 * only get worse as they land.
 *
 * The row is built from the carrier catalogue rather than written out here, so
 * a carrier added there appears with no edit to this file.
 */
export default function DeveloperCarrierLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ModuleTabs
        tabs={CARRIER_CATALOG.map((carrier) => ({
          href: `/admin/data/settings/developer/${carrier.slug}`,
          label: carrier.label,
        }))}
      />
      <div className="mt-6">{children}</div>
    </div>
  );
}
