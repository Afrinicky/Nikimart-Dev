import { Gift } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { AFFILIATE_MODULE_TABS, getModuleCounts } from "@/lib/affiliate-admin";

/**
 * The affiliate module's title block and tab row.
 *
 * A component rather than a route layout because two screens in this module —
 * an affiliate's own page and the add-affiliate form — have their own page
 * header and breadcrumbs, and a layout would stack a second one on top of
 * them. This way the module's six list screens share one header and those two
 * keep theirs.
 *
 * The badges are read here, so a queue nobody has looked at is visible from
 * every tab rather than only from the one it lives on.
 */
export async function AffiliateModuleHeader() {
  const counts = await getModuleCounts();

  return (
    <>
      <ModuleHeader
        title="Affiliate programme"
        subtitle="Who promotes Nickimart, what they are owed, and the rules it all runs on."
        icon={Gift}
      />
      <div className="mt-5">
        <ModuleTabs tabs={AFFILIATE_MODULE_TABS(counts)} />
      </div>
    </>
  );
}
